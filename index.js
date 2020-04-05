var esb = {},
    ldap = {},
    http = {},
    libRoot = __dirname;

module.exports = function(config) {
    // Initialize opts in case it isn't passed in
    config = config || {};

    // Get default data from files, otherwise initialize empty objects
    var settings = {},
        constants = {};

    // If opts contains a setting property, then merge that setting property with the default settings
    // This allows us to override the default settings with our own settings. The merge deals with conflicts by using the values from opts.
    if(config.hasOwnProperty('settings')) {
        Object.assign(settings, config.settings);
    }

    // This works exactly the same way as settings
    if(config.hasOwnProperty('constants')) {
        Object.assign(constants, config.constants);
    }

    config.settings = settings;
    config.constants = constants;

    appConfig = require('application-configuration')(config);

    esb = require('./lib/esb')(appConfig);
    ldap = require('./lib/ldap')(appConfig);
    http = require('./lib/http')(appConfig);

    return {
        esb: esb,
        ldap: ldap,
        libRoot: __dirname,
        http: http
    }
}
 
