define([
    'jquery',
    '/common/toolbar.js',
    '/components/nthen/index.js',
    '/common/sframe-common.js',
    '/common/common-interface.js',
    '/common/common-ui-elements.js',
    '/common/common-util.js',
    '/common/common-hash.js',
    '/common/inner/sidebar-layout.js',
    '/customize/messages.js',
    '/common/common-signing-keys.js',
    '/common/hyperscript.js',
    '/common/clipboard.js',
    'json.sortify',
    '/customize/application_config.js',
    '/api/config',
    '/api/instance',
    '/lib/datepicker/flatpickr.js',
    '/admin/customize.js',



    '/common/hyperscript.js',
    'css!/lib/datepicker/flatpickr.min.css',
    'css!/components/bootstrap/dist/css/bootstrap.min.css',
    'css!/components/components-font-awesome/css/font-awesome.min.css',
    'less!/admin/app-admin.less',
], function(
    $,
    Toolbar,
    nThen,
    SFCommon,
    UI,
    UIElements,
    Util,
    Hash,
    Sidebar,
    Messages,
    Keys,
    h,
    Clipboard,
    Sortify,
    AppConfig,
    ApiConfig,
    Instance,
    Flatpickr,
    Customize
) {

var AppConfigScreen = {}


AppConfigScreen.addConfigScreen = function (content) {
        var LOADING = 'cp-loading';

        if ($('#' + LOADING).length) {
        } else {
            // var form = Customize.disableApps();
            var elem = document.createElement('div');
            elem.setAttribute('id', 'cp-loading');

            let frame = h('div.configscreen',  {style: 'width: 70%; height: 75%; background-color: white'}, content)

            elem.append(frame)

        }

    };

return AppConfigScreen
});


