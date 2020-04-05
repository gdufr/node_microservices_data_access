/**
 * Receives endpoint, wsdl, request payload and performs a node to SOAP call using the method defined in the wsdl to ESB and receives a response
 */
// Load configuration
var _appConfig = require('application-configuration')(),
    app_config_settings = _appConfig.settings,
    cacheKeyCalc,
    // Non-custom modules
    soap = require('soap'),
    path = require("path"),
    uuid = require('uuid'),

    esbUtility = require('./esb/esb_utility.js'),

    logging = require('logging')(),
    logTypes = logging.logTypes,
    cache = require('cache')(),

    // ESB service and WSDL info
    wsdlRootPath = __dirname + '/' + _appConfig.settings.get('/ESB/WSDL_ROOT_PATH'),
    endPointKey = _appConfig.settings.get('/ESB/ENDPOINT'),
    endPointServer = _appConfig.settings.get('/ESB/ENDPOINT_LIST')[endPointKey], // Using the chosen endpoint key, get the server from endpoint list
    esbId = ""; // This is an ID we will use for our logs so that it's easier for us to match the request xml with response xml


function executeSoapClient(wsdlPath, clientOps, callback) {
    soap.createClient(wsdlPath, clientOps.options, function (err, client) {
        let esbOperation = clientOps.esbOperation,
            serviceConfig = clientOps.serviceConfig,
            esbService = clientOps.esbService,
            passedCacheKey = clientOps.cacheKey;

        if (err) {
            logging.general.log.error(logTypes.fnInside({
                esbId: esbId,
                "err": err,
                wsdlPath: wsdlPath
            }), "Error creating the client using the WSDL. Check the WSDL file and path");

            callback(err, "");
        } else {
            logging.general.log.debug(logTypes.fnInside({
                esbId: esbId,
                "err": err,
                wsdlPath: wsdlPath
            }), "Created the client");

            _addClientHeader(client, global.reqId, undefined, callback);

            // calls method defined in wsdl with payload
            
            logging.general.log.debug(logTypes.fnInside({esbId:esbId}), "Making the service call to: %s", esbOperation);

            // Client emits this request event before making the request. We log the input request XML here
            var esbStartTime;
            client.on('request', function (inputXml) {
                console.log("\ninputXML: \n"+inputXml+"\n\n");
                logging.general.log.debug(logTypes.fnInside({
                    esbId: esbId,
                    inputXml: inputXml
                }), "Request XML created");
                esbStartTime = new Date();
            });

            client.on('response', function (body, soapResult) {
                console.log("\nsoapResult:\n"+soapResult+"\n");

                var esbEndTime = new Date();
                var esbTimeElapsed = esbEndTime - esbStartTime;
                logging.general.log.info(logTypes.fnInside({
                    esbId: esbId,
                    service: esbService,
                    operation: esbOperation,
                    esbStartTime: esbStartTime,
                    esbEndTime: esbEndTime,
                    esbTimeElapsed: esbTimeElapsed
                }), "ESB call took: " + esbTimeElapsed + " milliseconds");

                logging.performance.log.info(logTypes.performance("esb", {
                    esbService: esbService,
                    esbOperation: esbOperation,
                    esbStartTime: esbStartTime,
                    esbEndTime: esbEndTime,
                    esbTimeElapsed: esbTimeElapsed
                }), "ESB call took: " + esbTimeElapsed + " milliseconds");
            });

            client[esbOperation](clientOps.input, function (err, soapResult, body) {

                // Throws an error if there is a FAULT ERROR (ESB exception, system error). Other errors (Response errors) are handled in the else block
                if (err) {
                    var faultError = esbUtility.parseException(err, serviceConfig.exceptionElement);

                    logging.general.log.error(logTypes.fnInside({
                        esbId: esbId,
                        err: err,
                        soapResult: soapResult,
                        body: body
                    }), "The call to ESB returned a system/fault error");

                    callback(faultError, soapResult);

                } else {
                    
                    logging.general.log.debug(logTypes.fnInside({
                        esbId: esbId,
                        err: err,
                        soapResult: soapResult,
                        body: body,
                        obfuscate: { soapResult: esbOperation }
                    }), "The call to ESB was returned");

                    // The SOAP call was successful, but there was an business logic error (there is a non 0000000 Response code)
                    if (soapResult.response !== undefined && soapResult.response.responseCode != _appConfig.constants.get('/ESB/CODES/SUCCESS')) {
                        var userErr = new Error();
                        userErr.response = {};
                        userErr.response.errorMessage = soapResult.response.responseDescription;
                        userErr.response.errorCode = soapResult.response.responseCode;
                        userErr.response.statusCode = _appConfig.constants.get('/ESB/CODES/STATUS_CODE_ERROR');
                        

                        // Log ESB application error xml here
                        logging.general.log.error(logTypes.fnInside({
                            esbId: esbId,
                            err: err,
                            soapResult: soapResult,
                            body: body
                        }), "The call to ESB returned an application/logic error");

                        callback(userErr, soapResult);
                    } else {

                        // The SOAP call was successful, but the result object is empty (there is a 0000000 Response code)
                        if(soapResult.result === null ||  soapResult.result === undefined) {
                            soapResult.result = [];
                        }
                        const isCacheable = ((app_config_settings.get(`/ESB/SERVICES/${esbService}/cache`)).indexOf(esbOperation) !== -1);
                        if (isCacheable && global.CACHECONFIG && global.CACHECONFIG.KEY) {
                            let operationKey = passedCacheKey || global.CACHECONFIG.ESBOPS[esbOperation];
                            // dont check cache if there is not JWT  being set
                            cache.cacheEsbResult(global.CACHECONFIG.KEY,operationKey, soapResult)
                                .then(()=> {
                                    logging.general.log.info(logTypes.fnInside({
                                        JWTKey: global.CACHECONFIG.KEY,
                                        calculatedCacheKey: operationKey,
                                        field: soapResult,
                                        esbId: esbId,
                                        reqId: global.reqId
                                    }), `CACHE WRITE SUCCESS: ${clientOps.esbService}-${esbOperation}`);
                                })
                                .catch((err)=> {
                                    logging.general.log.error(logTypes.fnInside({
                                        JWTKey: global.CACHECONFIG.KEY,
                                        calculatedCacheKey: operationKey,
                                        field: soapResult,
                                        esbId: esbId,
                                        reqId: global.reqId,
                                        error: err
                                    }), `CACHE WRITE ERROR: ${clientOps.esbService}-${esbOperation}`);
                                });
                        }
                        callback(err, soapResult);
                    }
                }
            });
        }
    }, {time: true});
}



/**
 * Used by the Service layer to make SOAP calls to ESB
 * @param {Object} params - the object that contains information about the ESB service/operation to call
 * @param {string} params.esbService - the name of the ESB service
 * @param {string} params.esbOperation - the name of the ESB operation
 * @param {string} params.input - the data input for this ESB service call in JS object format
 */
function soapCall(params, callback) {
    try {
        esbId = uuid.v4();

        logging.general.log.info(logTypes.fnEnter({
            esbId: esbId,
            params: params
        }), "Entering soapCall");

        var esbService = params.esbService;
        var esbOperation = params.esbOperation;
        var input = params.input;
        var passedCacheKey = params.cacheKey;

        var serviceConfig = _appConfig.settings.get('/ESB/SERVICES/' + esbService);
        var wsdlPath = libRoot + '/' + _appConfig.settings.get('/ESB/WSDL_ROOT_PATH') + serviceConfig.wsdlPath;

        logging.general.log.debug(logTypes.fnInside({
            esbId: esbId,
            serviceConfig: serviceConfig
        }));

        // By default, node-soap uses 'localhost' as the hostname for the ESB endpoint. We override it with
        // the value in application-configuration
        var options = {
            endpoint: endPointServer + serviceConfig.servicePath
        };
        let clientOps = {esbService: esbService, esbOperation: esbOperation, input: input };
        clientOps.options = options;
        clientOps.serviceConfig = serviceConfig;

        if (process.env.DEBUG) {
            console.log('===================================  esb.js');
            console.log('\nesbService: ' + esbService);
            console.log('\nesbOperation: ' + esbOperation);
            console.log('\ninput: ', input);
            console.log('\nserviceConfig: ', serviceConfig);
            console.log('\nwsdlPath: ', wsdlPath);
            console.log('\noptions: ', options);
            console.log('\ncalculatedCacheKey: ', global.CACHECONFIG.ESBOPS[esbOperation]);
            console.log('\npassedCacheKey: ', passedCacheKey);
            console.log('\n=================================== end esb.js');
        }

        // this can be used to force a particular esb operation to fail
        // also see _addClientHeader below for usage of simulateBadClientId
        // if (esbOperation == 'getUnbilledUsage') {
        //     options.endpoint = "";
        // }
        const isCacheable = ((app_config_settings.get(`/ESB/SERVICES/${esbService}/cache`)).indexOf(esbOperation) !== -1);
        if ( isCacheable && global.CACHECONFIG && (global.CACHECONFIG.KEY || passedCacheKey)) {
            // if we were passed in a cache key then use that, otherwise default to global cache key
            let operationKey = passedCacheKey || global.CACHECONFIG.ESBOPS[esbOperation];
            cache.fetchEsbResult(global.CACHECONFIG.KEY,operationKey)
                .then(cachedSoapResult => {
                    // exit out because of CACHE HIT - NO CALL TO ESB
                    logging.general.log.info(logTypes.fnInside({
                        JWTKey: global.CACHECONFIG.KEY,
                        calculatedCacheKey: operationKey,
                        fetchedResult: cachedSoapResult,
                        esbId: esbId,
                        reqId: global.reqId
                    }), `CACHE HIT SUCCESS: ${esbService}-${esbOperation}`);
                    return callback(null, cachedSoapResult);
                })
                .catch(err => {
                    //unhappy path - cachemiss - must continue with call to ESB
                    logging.general.log.debug(logTypes.fnInside({
                        JWTKey: global.CACHECONFIG.KEY,
                        calculatedCacheKey: operationKey,
                        esbId: esbId,
                        reqId: global.reqId,
                        error: err ? err : "CACHE MISS No KEY found in REDIS"
                    }), `CACHE MISS: ${esbService}-${esbOperation}`);

                    clientOps.cacheKey = operationKey;
                    executeSoapClient(wsdlPath, clientOps, callback);
                });
        } else {
            // no GLOBAL CONFIGS FOUND execute soapClient
            executeSoapClient(wsdlPath, clientOps, callback);
        }

    } catch (err) {
        logging.general.log.error("Error occurred when trying to call ESB");
        if (!err.response) err.response = {};
        err.response.errorCode = _appConfig.constants.get('/NODE_CODES/ESB_ERROR');
        callback(err, "");
    }

    logging.general.log.info(logTypes.fnExit({esbId: esbId}), "Exiting soapCall");
}

/**
 * This method will add client header information to call ESB.
 * @param client
 */
function _addClientHeader(client, transactionId, customerId, callback) {
    try {
        
        var clientId = _appConfig.settings.get('/ESB/CLIENTID'); // Username
        var SecurityToken = _appConfig.settings.get('/ESB/SECURITY_TOKEN'); // Password
        var x509Cert = _appConfig.settings.get('/ESB/X509_CERT'); // x.509 cert

        logging.general.log.info(logTypes.fnEnter({esbId: esbId}), "Entering _addClientHeader: adding security headers to SOAP input XML");


        // Add security using username, password, x.509 cert

        // Ideally this would be done with the node-soap WSSecurity functions, but those functions only work
        // if we are providing a private key to sign the XML. However, we are not provided a private key to
        // sign the XML with. The X.509 cert is just used to authenticate the user. Therefore, we have to
        // manually add the necessary security elements needed.

        // Add the x509cert in the Header/Security/BinarySecurityToken element

        client.addSoapHeader({
                "Security": {
                    "BinarySecurityToken": {
                        "attributes": {
                            "wsu:Id": "Me",
                            "ValueType": "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3",
                            "EncodingType": "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary",
                            "xmlns:wsu": "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
                        },
                        "$value": x509Cert
                    }
                }
            },
            "",
            "wss",
            "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd");

        // Add the username and password to the Header/MessageHeader/clientID and Header/MessageHeader/SecurityToken
        // elements
        var header = {
            "MessageHeader": {
                "clientId": clientId,
                "SecurityToken": SecurityToken,
                "transactionId": transactionId
            }
        };

        if (global.CUSTOMERID !== undefined) {

            logging.general.log.debug(logTypes.fnInside({
                esbId: esbId,
                client: client
            }), "\nsetting customerId in outgoing soap header to :\n"+global.CUSTOMERID+"\n\n");

            header.MessageHeader.clientExtensions = {
                "key": "customerId",
                "value": global.CUSTOMERID
            };
        }

        client.addSoapHeader(header,
            "",
            "enterprise_messageheader_xsd",
            "");
    } catch (err) {

        logging.general.log.error(logTypes.fnInside({
            esbId: esbId,
            client: client
        }), "Error adding security headers to request XML");

        err.response = {
            errorCode: _appConfig.constants.get('/NODE_CODES/ESB_ERROR')
        };

        callBack(err, "");
    }

    logging.general.log.info(logTypes.fnExit({esbId: esbId}), "Exiting _addClientHeader");

}

module.exports = function (appConfig) {
    _appConfig = appConfig;


    // ESB service and WSDL info
    wsdlRootPath = _appConfig.settings.get('/ESB/WSDL_ROOT_PATH'),
        endPointKey = _appConfig.settings.get('/ESB/ENDPOINT'),
        endPointServer = _appConfig.settings.get('/ESB/ENDPOINT_LIST')[endPointKey]; // Using the chosen endpoint key, get the server from endpoint list

    return {
        soapCall: soapCall,
        setCacheKey : function(inCacheKey) {cacheKeyCalc = inCacheKey}
    };
};
