const request = require('request-promise');

const appConfig = require('application-configuration')();
const settings = appConfig.settings;
const constants = appConfig.constants;

const logging = require('logging')();
const generalLogger = logging.general;
const performanceLogger = logging.performance;

// simple get request
// any needed access keys can be added to the config and brought in here
function httpCall(options){

    generalLogger.log.trace("httpRequest called with options", options);

    return request(options.url)
        .then(function (response) {
            generalLogger.log.trace("httpRequest returning response: ", response);

            return response;
        })
        .catch(function (err) {
            generalLogger.log.error("request returned err", err);
            return {err: err}
        })
}

module.exports = function () {

    return {
        httpCall: httpCall
    }
}