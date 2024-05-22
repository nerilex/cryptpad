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
        channels: {}
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
        let rdm = 300 + Math.floor(1000 * Math.random());
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
            let min = Math.max(0, i-5); // XXX 5 users per pad
            for (let j = min; j<i; j++) {
                myPads.push(j);
                joinChan(me, j, w());
            }
        }).nThen(w => {
            if (init) { return; }
            myPads.forEach(function (id) {
                let channel = Env.users[id].secret.channel;
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
                        wc.bcast(m);
                    });
                });
            });
        }).nThen(w => {
            // TODO
            // RPC commands? Upload blob?
        }).nThen(w => {
            cb();
        });

    };

    let start = function (numberUsers, cb) {
        clearDataCmd(numberUsers);
        var sem = Saferphore.create(10);
        nThen(w => {
            for (let i=0; i<numberUsers; i++) {
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

    let makeAllData = function (numberUsers, cb) {
        var sem = Saferphore.create(10);
        nThen(w => {
            for (let i=0; i<numberUsers; i++) {
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
        let input = h('input', {type:'number',value:10,min:1, step:1});
        let label = h('label', [
            h('span', 'Number of users'),
            input
        ]);
        let button = h('button.btn.btn-primary', 'Start load testing');
        let buttonPatch = h('button.btn.btn-primary', {style:'display:none;'}, 'Start sending patches');
        let buttonData = h('button.btn', 'Create data');
        var spinner = UI.makeSpinner();
        let content = h('div', [
            h('div.form', [
                label,
                h('nav', [button, buttonPatch, buttonData, spinner.spinner])
            ])
        ]);
        let started = false;
        $(button).click(() => {
            if (started) { return; }
            spinner.spin();
            started = true;
            $(button).remove();
            let users = Number($(input).val());
            if (typeof(users) !== "number" || !users) {
                return void console.error('Not a valid number');
            }
            $(buttonData).remove();
            start(users, () => {
                spinner.done();
                UI.log('READY: you can now start sending patches');
                $(buttonPatch).show();
            });
        });
        $(buttonPatch).click(() => {
            startSendDataEvt.fire();
            $(buttonPatch).remove();
        });
        let startedData = false;
        $(buttonData).click(() => {
            if (startedData) { return; }
            startedData = true;
            spinner.spin();
            let users = Number($(input).val());
            if (typeof(users) !== "number" || !users) {
                return void console.error('Not a valid number');
            }
            $(button).remove();
            $(buttonData).remove();
            makeAllData(users, () => {
                spinner.done();
                UI.log('DONE');
            });
        });
        $('body').append(content);
    });
});
