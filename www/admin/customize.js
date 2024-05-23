define([
    'jquery',
    '/components/nthen/index.js',
    '/common/common-interface.js',
    '/common/common-ui-elements.js',
    '/common/common-util.js',
    '/common/common-hash.js',
    '/customize/messages.js',
    '/common/hyperscript.js',
    '/common/inner/sidebar-layout.js'
], function(
    $,
    nThen,
    UI,
    UIElements,
    Util,
    Hash,
    Messages,
    h,
    Sidebar
) {

    var Customize = {}

    Customize.disableApps = function (sendAdminDecree) {

    const blocks = Sidebar.blocks
    
    const grid = blocks.block([], 'cp-admin-customize-apps-grid');
    const allApps = ['pad', 'code', 'kanban', 'slide', 'sheet', 'form', 'whiteboard', 'diagram'];
	const availableApps = []


        //         let sendAdminDecree = function (command, data, callback) {
        //             var params = ['ADMIN_DECREE', [command, data]];  
        //             rpc.send('ADMIN', params, callback)
        //         };
        //     const flushCache = (cb) => {
        //     cb = cb || function () {};
        //     sFrameChan.query('Q_ADMIN_RPC', {
        //         cmd: 'FLUSH_CACHE',
        //     }, cb);
        // };
            
    function select(app) {

        if (availableApps.indexOf(app) === -1) {
            availableApps.push(app);
            $(`#${app}-block`).attr('class', 'active-app') 
        } else {
            availableApps.splice(availableApps.indexOf(app), 1)
            $(`#${app}-block`).attr('class', 'inactive-app')
        }
                
    }

    allApps.forEach(app => { 
        let appBlock = h('div', {class: 'inactive-app', id: `${app}-block`}, app)
        $(appBlock).addClass('cp-app-drive-element-grid')
        $(grid).append(appBlock);
        $(appBlock).on('click', () => select(app))
    }); 

    var save = blocks.activeButton('primary', '', Messages.settings_save, function (done) {

        sendAdminDecree('DISABLE_APPS', availableApps, function (e, response) {
            
            if (e || response.error) {
                UI.warn(Messages.error);
                $input.val('');
                console.error(e, response);
                done(false);
                return;
            }
            // flushCache();
            done(true);
            UI.log('hello!');
        })
    });
    
    return form = blocks.form([
        grid 
    ], blocks.nav([save]));

  };
  return Customize


})  
  
  