var xml2js = require('xml2js'),
    _appConfig = require('application-configuration')();

function parseException(err, exceptionElement) {
    // Unfortunately this err object doesn't get parsed from XML into a nice JS object so we need to use xml2js to parse it
    try {

        err.response = {};

        xml2js.parseString(err.body, {
            tagNameProcessors: [xml2js.processors.stripPrefix]
        }, function (parseErr, resultErr) {
            if (parseErr) {
                // err.message = ebppConstant.ERROR_MSG_SOAP_DOWN;
                err.errorCode = _appConfig.constants.get('/NODE_CODES/ESB_DOWN/ERROR_CODE');
                err.statusCode = _appConfig.constants.get('/NODE_CODES/ESB_DOWN/STATUS_CODE');
            } else {

                var parentObj = resultErr["Envelope"]["Body"][0]["Fault"][0]["detail"][0];
                if (parentObj["errorInfo"] != undefined) {
                    var errorCode = parentObj["errorInfo"][0]["error-code"][0];
                    var errorDesc = parentObj["errorInfo"][0]["error-message"][0];

                    err.response.errorCode = errorCode;
                    err.response.errorMessage = errorDesc;
                    
                    if (err.response.errorCode === _appConfig.constants.get('/ESB/CODES/SUB_CODE')) {
                        err.response.statusCode = _appConfig.constants.get('/NODE_CODES/ESB_DOWN/STATUS_CODE');
                    }
                    else {
                        err.response.statusCode = _appConfig.constants.get('/ESB/CODES/STATUS_CODE_FAULT');
                    }
                    
                    return err;
                }

                var errorCode = parentObj[exceptionElement][0]["errorInformation"][0]["errorCode"][0];
                var errorDesc = parentObj[exceptionElement][0]["errorInformation"][0]["errorDescription"][0];
                
                if(err.response.statusCode === undefined) {
                    err.response.statusCode = _appConfig.constants.get('/ESB/CODES/STATUS_CODE_FAULT');
                }

                err.response.errorCode = errorCode;
                err.response.errorMessage = errorDesc;

            }

        });

        return err;

    } catch (errParse) {
        err.response = {};
        err.response.errorCode = _appConfig.constants.get('/ESB/CODES/SYSTEM_ERROR');
        err.response.errorMessage = "ESB system error"
        err.response.statusCode = _appConfig.constants.get('/ESB/CODES/STATUS_CODE_FAULT');
        

        return err;
    }

};


module.exports.parseException = parseException;