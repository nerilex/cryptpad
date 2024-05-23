// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([
    '/api/config',
    'jquery',
    'netflux-client',
    '/common/hyperscript.js',
    '/common/common-hash.js',
    '/common/common-util.js',
    '/common/common-interface.js',
    '/common/outer/network-config.js',
    '/components/nthen/index.js',
    '/components/saferphore/index.js',
    '/components/tweetnacl/nacl-fast.min.js',
    'less!/customize/src/less2/pages/page-load.less',
    'css!/components/components-font-awesome/css/font-awesome.min.css',
], function (Config, $, Netflux, h, Hash, Util, UI, NetConfig, nThen, Saferphore) {
    const wsUrl = NetConfig.getWebsocketURL();
    const nacl = window.nacl;
    let makeNetwork = function (cb) {
        Netflux.connect(wsUrl).then(function (network) {
            cb(null, network);
        }, function (err) {
            cb(err);
        });
    };

    let Env = {
        users: {},
        channels: {},
        queries: 0,
        lag: [],
        errors: 0
    };
    let startSendDataEvt = Util.mkEvent(true);

    let hk;

    let edPublic = "gH12mjdXc1hGsVMtCJeoGTkBQRA21V0VOEGphoddmPM=";
    let edPrivate = "5V0tO8q1wKr62KIJadYdXaXvgG8f6FQtS6XHYrHYLzGAfXaaN1dzWEaxUy0Il6gZOQFBEDbVXRU4QamGh12Y8w==";

    let hash = "/2/undefined/edit/UCrOzk5XEOP7qi"; // missing 10 characters

    let makeHash = (id) => {
        let l = String(id).length;
        let add = 10 - l;
        let str = String(id);
        for(let i=0; i<add; i++) {
            str = 'x' + str;
        }
        let _hash = hash + str + '/';
        return _hash;
    };

    let getMsg = isCp => {
        let base = nacl.util.encodeBase64(nacl.randomBytes(30));
        let repeat = isCp ? 300 : 5;
        let str = base;
        for (let i = 0; i < repeat; i++) {
            str += base;
        }
        return str;
    };
    let signMsg = (isCp, secret) => {
        let msg = getMsg(isCp);
        let signKey = nacl.util.decodeBase64(secret.keys.signKey);
        let signed = nacl.util.encodeBase64(nacl.sign(nacl.util.decodeUTF8(msg), signKey));
        if (!isCp) { return signed; }
        let id = msg.slice(0,8);
        return `cp|${id}|${signed}`;
    };
    let makeData = function (id, cb) {
        let user = Env.users[id];
        if (!user || !user.wc || !user.secret || !user.isEmpty) {
            return void setTimeout(cb);
        }
        let n = nThen;
        for (let i = 1; i<=130; i++) {
            n = n(w => {
                let m = signMsg(!(i%50), user.secret);
                user.wc.bcast(m).then(w());
            }).nThen;
        }
        n(() => {
            cb();
        });
    };

    let clearDataCmd = max => {
        let cmd = 'Run the following commands to clear all the data\n';
        cmd += 'rm ';
        for (let i=0; i<max; i++) {
            let hash = makeHash(i);
            let secret = Hash.getSecrets('pad', hash);
            let chan = secret.channel;
            cmd += `${chan.slice(0,2)}/${chan}* `;
        }
        console.error(cmd);
    };


    let joinChan = (user, id, cb) => {
        if (!user || !user.network) { return; }
        let network = user.network;
        let hash = makeHash(id);
        let secret = Hash.getSecrets('pad', hash);
        if (!user.hash && !user.secret) {
            user.hash = hash;
            user.secret = secret;
        }
        user.isEmpty = true; // Only used with the makeData button
        let chan = Env.channels[secret.channel] = Env.channels[secret.channel] || {
            secret: secret,
        };
        let n = 0;
        network.on('message', (msg, sender) => {
            if (sender !== hk) { return; }
            let parsed = JSON.parse(msg);
            if (parsed.state === 1 && parsed.channel === secret.channel) {
                chan.total = n; // %50 to know if we should make a cp
                return void cb();
            }
            let m = parsed[4];
            if (parsed[3] !== secret.channel) { return; }
            if (!m) { return; }
            n++;
            user.isEmpty = false;
        });
        network.join(secret.channel).then(wc => {
            user.wc = wc;
            if (!hk) {
                wc.members.forEach(function (p) {
                    if (p.length === 16) { hk = p; }
                });
            }
            let cfg = {
                metadata: {
                    validateKey: secret.keys.validateKey,
                    owners: [edPublic]
                }
            };
            let msg = ['GET_HISTORY', wc.id, cfg];
            network.sendto(hk, JSON.stringify(msg));
        });
    };


    // TODO
    // Connect many websockets and have them run tasks
    //      * [x] JOIN with 10 users per pad
    //      * [x] GET_HISTORY
    //      * [x] SEND content at random intervals
    //      * UPLOAD random blobs
    //      * RPC commands?

    let setRandomInterval = f => {
        let delay = (Env.delay - 300)*2;
        let rdm = 300 + Math.floor(delay * Math.random());
        if (Env.stopPatch) { return; }
        setTimeout(function () {
            f();
            setRandomInterval(f);
        }, rdm);
    };

    let startOneUser = function (i, init, cb) {
        let network;
        let myPads = [i];
        let me;
        nThen(w => {
            makeNetwork(w((err, _network) => {
                if (err) {
                    w.abort();
                    return void console.error(err);
                }
                network = _network;
                me = Env.users[i] = {
                    network: network,
                    myPads
                };
            }));
        }).nThen(w => {
            joinChan(me, i, w());
        }).nThen(w => {
            if (!init) { return; }
            makeData(i, w());
        }).nThen(w => {
            if (init) { return; }
            console.warn(i, me.secret.channel);
            let min = Math.max(Env.offset, i-5); // XXX 5 users per pad
            for (let j = min; j<i; j++) {
                myPads.push(j);
                joinChan(me, j, w());
            }
        }).nThen(w => {
            if (init) { return; }
            myPads.forEach(function (id) {
                let channel = (Env.users[id] && Env.users[id].secret) ? Env.users[id].secret.channel : null;
                if (channel==null) {
                       console.log("Channel " + id + " is null");
                } else {
                    let wc = me.network.webChannels.find(obj => {
                        return obj.id === channel;
                    });
                    let chanObj = Env.channels[channel] || {};
                    // Only fill the chan if it is not originally empty
                    if (Env.users[id].isEmpty) { return; }
                    startSendDataEvt.reg(function () {
                        setRandomInterval(function () {
                            let i = chanObj.total || 0;
                            let m = signMsg(!(i%50), chanObj.secret);
                            console.log('Send patch', channel, i%50);
                            chanObj.total = i+1;
                            Env.incQueries();
                            let t = +new Date();
                            wc.bcast(m).then(() => {
                                let now = +new Date();
                                Env.lag.push((now - t));
                            }, err => {
                                Env.errors++;
                                console.error(err);
                            });
                        });
                    });
                }
            });
        }).nThen(w => {
            // TODO
            // RPC commands? Upload blob?
        }).nThen(w => {
            cb();
        });

    };

    let start = function (cb) {
        clearDataCmd(Env.numberUsers);
        var sem = Saferphore.create(20);
        let max = Env.numberUsers + Env.offset;
        nThen(w => {
            for (let i=Env.offset; i<max; i++) {
                let done = w();
                sem.take(function(give) {
                    console.log('loading user ', i);
                    startOneUser(i, false, () => {
                        setTimeout(give(() => {
                            done();
                        }));
                        console.log('loaded user ', i);
                    });
                });
            }
        }).nThen(() => {
            cb();
        });
    };

    let makeAllData = function (cb) {
        var sem = Saferphore.create(10);
        let max = Env.numberUsers + Env.offset;
        nThen(w => {
            for (let i=Env.offset; i<max; i++) {
                let done = w();
                sem.take(function(give) {
                    console.log('loading user ', i);
                    startOneUser(i, true, () => {
                        setTimeout(give(() => {
                            done();
                        }));
                        console.log('loaded user ', i);
                    });
                });
            }
        }).nThen(() => {
            cb();
        });
    };

    $(function () {
        let input = h('input', {type:'number',value:100,min:1, step:1});
        let label = h('label', [
            h('span', 'Number of users'),
            input
        ]);

        let inputOff = h('input', {type:'number',value:0,min:0, step:1});
        let labelOff = h('label', [
            h('span', 'User offset'),
            inputOff
        ]);

        let inputFreq = h('input', {type:'number',value:800,min:300, step:1});
        let labelFreq = h('label', [
            h('span', 'Average time between patches (ms) per user per channel'),
            inputFreq
        ]);

        let inputMax = h('input', {type:'number',value:0,min:0, step:1});
        let labelMax = h('label', [
            h('span', 'Max queries (0 for infinite)'),
            inputMax
        ]);

        let queries = h('span');
        let freq = h('span');
        let freqr = h('span');
        let time = h('span');
        let lag = h('span');
        let errors = h('span');
        let res = h('div', [
            queries,
            h('br'),
            time,
            h('br'),
            freq,
            h('br'),
            freqr,
            h('br'),
            lag,
            h('br'),
            errors
        ]);

        let button = h('button.btn.btn-primary', 'Start load testing');
        let buttonPatch = h('button.btn.btn-primary', {style:'display:none;'}, 'Start sending patches');
        let buttonStopPatch = h('button.btn.btn-danger-alt', {style:'display:none;'}, 'STOP sending patches');
        let buttonData = h('button.btn', 'Create data');
        var spinner = UI.makeSpinner();
        let content = h('div', [
            h('div.form', [
                label,
                labelOff,
                labelFreq,
                labelMax,
                h('nav', [button, buttonPatch, buttonStopPatch, buttonData, spinner.spinner]),
                res
            ])
        ]);

        Env.incQueries = () => {
            Env.queries++;
            if (Env.maxQ && Env.queries >= Env.maxQ) {
                Env.stopPatch = true;
                $(buttonStopPatch).click();
            }
        };

        let started = false;
        $(button).click(() => {
            if (started) { return; }
            spinner.spin();
            started = true;
            //$(button).remove();
            let users = Env.numberUsers = Number($(input).val());
            Env.offset = Number($(inputOff).val()) || 0;
            Env.delay = Number($(inputFreq).val()) || 800;
            Env.maxQ = Number($(inputMax).val()) || 0;
            if (typeof(users) !== "number" || !users) {
                return void console.error('Not a valid number');
            }
            $(buttonData).remove();
            start(() => {
                spinner.done();
                started = false;
                UI.log('READY: you can now start sending patches');
                $(buttonPatch).show();
            });
        });
        let qIt, fIt;
        let last = {};
        $(buttonPatch).click(() => {
            startSendDataEvt.fire();
            $(buttonPatch).remove();
            $(buttonStopPatch).show();
            Env.start = +new Date();
            last.t = +new Date();
            last.q = 0;
            qIt = setInterval(() => {
                $(queries).text('Queries: '+Env.queries);
                let q = Env.queries;
                let now = +new Date();
                let diffTime = (now-Env.start)/1000;
                let f = Math.floor(q/diffTime);
                const average = Math.round((Env.lag.length && Env.lag.reduce((a, b) => a + b, 0) / Env.lag.length)) || 0;

                $(freq).text('Queries/s (all): '+f);
                $(time).text('Time: '+Math.floor(diffTime)+'s');
                $(lag).text('Avg response time: '+average+'ms');
                $(errors).text('Errors: '+Env.errors);
                Env.lag = [];
            }, 200);
            fIt = setInterval(() => {
                let q = Env.queries;
                let now = +new Date();
                let fr = Math.floor(1000*(Env.queries-last.q)/(now-last.t));

                last.t = +new Date();
                last.q = q;
                $(freqr).text('Queries/s (recent): '+fr);
            }, 1000);
        });
        $(buttonStopPatch).click(() => {
            Env.stopPatch = true;
            clearInterval(qIt);
            clearInterval(fIt);
            $(buttonStopPatch).remove();
        });
        let startedData = false;
        $(buttonData).click(() => {
            if (startedData) { return; }
            startedData = true;
            spinner.spin();
            let users = Env.numberUsers = Number($(input).val());
            Env.offset = Number($(inputOff).val()) || 0;
            Env.delay = Number($(inputFreq).val()) || 800;
            Env.maxQ = Number($(inputMax).val()) || 0;
            if (typeof(users) !== "number" || !users) {
                return void console.error('Not a valid number');
            }
            $(button).remove();
            $(buttonData).remove();
            makeAllData(() => {
                spinner.done();
                UI.log('DONE');
            });
        });
        $('body').append(content);
    });
});
