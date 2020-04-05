/**
 * Receives LDAP endPointServer, DN,CN, attributes, request payload and performs a node to LDAP call using the method defined and receives a response
 */
// Load configuration
var _appConfig = require('application-configuration')(),

    // Non-custom modules
    ldap = require('ldapjs'),
    path = require("path"),
    Promise = require("bluebird"),
    tls = require('tls'),
    fs = require("fs"),
    Boom = require('boom'),
    app_config_constants = _appConfig.constants,
    
    // Logging libraries
    logging = require('logging')(),
    logTypes = logging.logTypes,

    //local variable
    ldapClient,

    // LDAP Server Info
    ldapHostUrl =  _appConfig.settings.get('/LDAP/ENDPOINT'),
    ldapHostServer = _appConfig.settings.get('/LDAP/ENDPOINT_LIST')[ldapHostUrl], // Using the chosen endpoint key, get the server from endpoint list
    ldapHost = _appConfig.settings.get('/LDAP/LDAPHOST_LIST')[ldapHostUrl],
    ldapPort = _appConfig.settings.get('/LDAP/TLSPORT'),
    ldapCertPath = _appConfig.settings.get('/LDAP/LDAPCERT'), // x.509 cert
    requestCert = _appConfig.settings.get('/LDAP/REQUEST_CERTIFICATE'),
    rejectUnauthorized = _appConfig.settings.get('/LDAP/REJECT_UNAUTHORIZED'),
    rootDN = _appConfig.settings.get('/LDAP/ROOTDN'),
    rootSecret = _appConfig.settings.get('/LDAP/ROOTSECRET');

var tlsOptions = {
    host: ldapHost,
    port: ldapPort,
    cert: ldapCertPath,
    requestCert: requestCert,
    rejectUnauthorized: rejectUnauthorized
};


const ldapOptions = {
    url: ldapHostServer,
    // timeout: _appConfig.settings.get('/LDAP/OPERATIONTIMEOUT'), //Operations timeout
    connectTimeout: _appConfig.settings.get('/LDAP/CONNTIMEOUT'), //connection timeout
    maxIdleTime:_appConfig.settings.get('/LDAP/MAXIDLETIMEOUT'), //IdleTime
    reconnect: _appConfig.settings.get('/LDAP/RECONNECT'),
    reconnect: {
        initialDelay: _appConfig.settings.get('/LDAP/RECONNECTINITDELAY'),
        maxDelay: _appConfig.settings.get('/LDAP/RECONNECTMAXDELAY'),
        failAfter: _appConfig.settings.get('/LDAP/RECONNECTFAILAFTERDELAY')
    },
    maxConnections : _appConfig.settings.get('/LDAP/MAXCONNECTIONS'),
    tlsOptions: tlsOptions,
    bindDN : rootDN,
    bindCredentials : rootSecret
};

/**
 * Used by the Service layer to make LDAP calls to eDirectory
 * @param {Object} params - the object that contains information about the LDAP service DN,CN and operation(Search, Add, Modify and Del)  to call
 * @param {string} params.DN 
 * @param {string} params.CN 
 * @param {string} params.secret
 * @param {string} params.userId
 * @param {string} params.ldapOperation - the name of the LDAP operation (Search, Add, Modify and Del)
 * */

///////////////////////////// Exposed Functions /////////////////////////////

function searchUser(newDN, opts) {
    return new Promise(function(resolve, reject){

        createClient()
            .then(function(result){
                logging.general.log.info(logTypes.fnEnter({
                newDN: newDN,
                opts: opts
                }), "Entering LDAP Search function");
                
                let ldapStartTime = new Date();

                ldapClient.searchAsync(newDN,opts,function(err,res){
                    res.on('searchEntry', function (entry) {
                        logging.general.log.debug(logTypes.fnInside({
                        "err": err,
                        newDN: newDN
                    }), "LDAP Search success using " + newDN);

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "searchUser - searchEntry",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return resolve({success : JSON.stringify(entry.object)});
                    });
                    res.on('searchReference', function (referral) {
                        logging.general.log.debug(logTypes.fnInside({
                        "err": err,
                        newDN: newDN
                    }), "LDAP Search success using " + newDN);

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "searchUser - searchReference",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return resolve({success : JSON.stringify(entry.object)});
                    });
                    res.on('error', function (err) {
                        logging.general.log.error(logTypes.fnInside({
                        "err": err,
                        newDN: newDN
                    }), "LDAP Search failed using the credentials" + newDN );


                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "searchUser - error",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);
                        ldapClient.unbind();
                        ldapClient.destroy();
                        return reject({err:err});
                    });
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                "err": err,
                newDN: newDN
                }), "LDAP Bind failed using the credentials");

                return reject({err:err});
            })
        });
    });
}

function multiDelUser(newDN, opts) {
    return new Promise(function(resolve, reject){
        //bind(rootDN, rootSecret)
        createClient()
            .then(function(result){
                logging.general.log.info(logTypes.fnEnter({
                    newDN: newDN,
                    opts: opts
                }), "Entering LDAP multiDelUser Search function");
                let promiseArray = [];
                let ldapStartTime = new Date();
                ldapClient.searchAsync(newDN,opts,function(err,res){
                    res.on('searchEntry', function (entry) {
                        logging.general.log.debug(logTypes.fnInside({
                            "err": err,
                            newDN: newDN
                        }), "LDAP Search success using " + newDN);

                    promiseArray.push(ldapClient.delAsync(entry.dn)
                        .then(function(result){
                            logging.general.log.debug(logTypes.fnInside({
                                newDN: newDN
                            }), "LDAP multiUser delete success using " + newDN);    
                        }))
                    });
                    res.on('end', function (err) {

                        Promise.all(promiseArray)
                            .then(function(res) {

                                let ldapEndTime = new Date();
                                let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                                logging.performance.log.info(logTypes.performance("ldap", {
                                    ldapOperation: "multiDelUser - end",
                                    ldapDN: newDN,
                                    ldapStartTime: ldapStartTime,
                                    ldapEndTime: ldapEndTime,
                                    ldapTimeElapsed: ldapTimeElapsed
                                }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                                resolve();
                            })
                            .catch(function(err) {
                                reject(err);
                            });
                    });
                    res.on('error', function (err) {
                        logging.general.log.error(logTypes.fnInside({
                            "err": err,
                            newDN: newDN
                        }), "LDAP Search failed using the credentials" + newDN );

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "multiDelUser - error",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return reject(err);
                    });
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                    "err": err,
                    newDN: newDN
                    }), "LDAP Bind failed using the credentials");

                return reject(err);
            })
        });
    });
}

// searchUser function for multiple users
function simplifiedSearch(newDN, opts) {
    return new Promise(function(resolve, reject){
        let userObj = [];

        createClient()
            .then(function(result){
                logging.general.log.info(logTypes.fnEnter({
                newDN: newDN,
                opts: opts
            }), "Entering LDAP simplifiedSearch function");
            
                let ldapStartTime = new Date();

                ldapClient.searchAsync(newDN,opts,function(err,res){
                    res.on('searchEntry', function (entry) {
                        logging.general.log.debug(logTypes.fnInside({
                            "newDN": newDN,
                            "opts": opts,
                            "entry": entry
                        }), "LDAP Search success using " + newDN);
                        userObj.push(JSON.stringify(entry.object));
                    });
                    res.on('searchReference', function (referral) {
                        logging.general.log.debug(logTypes.fnInside({
                            "err": err,
                            newDN: newDN
                        }), "LDAP Search success using " + newDN);
                        userObj.push(JSON.stringify(entry.object));
                    });
                    res.on('error', function (err) {
                        logging.general.log.error(logTypes.fnInside({
                            "err": err,
                            newDN: newDN
                        }), "LDAP Search failed using the credentials" + newDN );
                    });
                    res.on('end', function (result) {
                        logging.general.log.error(logTypes.fnInside({
                            "userObj": userObj,
                            result: result
                        }), "LDAP Search ended using the credentials" + newDN );

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "simplifiedSearch - end",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return resolve(userObj);
                    });
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                "err": err,
                newDN: newDN
                }), "LDAP Bind failed using the credentials");

                return reject(err);
            })
        });
    });
}

function addUser(newDN, newUser) {
    return new Promise(function(resolve, reject){

        createClient()
            .then(function(result){
                logging.general.log.info(logTypes.fnEnter({
                }), "Entering LDAP Add function");
                
                let ldapStartTime = new Date();
                ldapClient.addAsync(newDN, newUser)
                    .then(function(result){
                        logging.general.log.debug(logTypes.fnInside({
                        newDN: newDN
                    }), "LDAP Add success using " + newDN);

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "addUser",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return resolve({success : "Add action successful"});
                    })
                    .catch(function(err){
                        logging.general.log.error(logTypes.fnInside({
                        "err": err,
                        newDN: newDN
                        }), "LDAP Add failed using the credentials " + newDN );

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "addUser - error",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return reject({err:err});
                    });
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                "err": err,
                rootDN: rootDN
                }), "LDAP Bind failed using the credentials");

                return reject({err:err});
            })
    });
}
function modifyUser(newDN, change) {
    return new Promise(function(resolve, reject){
        //bind(rootDN,rootSecret)
        createClient()
            .then(function(result){
                logging.general.log.info(logTypes.fnEnter({
                // params: params
                }), "Entering LDAP modify function");
                
                let ldapStartTime = new Date();
                ldapClient.modifyAsync(newDN, change)
                    .then(function(result){
                        logging.general.log.debug(logTypes.fnInside({
                        newDN: newDN
                    }), "LDAP update success using "+ newDN);

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "modifyUser",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return resolve({success : "delete action successful"});
                    })
                    .catch(function(err){
                        logging.general.log.error(logTypes.fnInside({
                        "err": err,
                        newDN: newDN
                    }), "LDAP update failed using the credentials" + newDN);

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "modifyUser - error",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return reject({err:err});
                    });
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                "err": err,
                rootDN: rootDN
                }), "LDAP Bind failed using the credentials");

                return reject({err:err});
            })
    });
}
function modifyDN(oldDN, newDN) {
    return new Promise(function(resolve, reject){

        createClient()
            .then(function(result){
                logging.general.log.info(logTypes.fnEnter({

                }), "Entering LDAP modify function");
                let ldapStartTime = new Date();
                ldapClient.modifyDNAsync(oldDN, newDN)
                    .then(function(result){
                        logging.general.log.debug(logTypes.fnInside({
                            newDN: newDN
                        }), "LDAP update success using "+ newDN);

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "modifyDN",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return resolve({success : "delete action successful"});
                    })
                    .catch(function(err){
                        logging.general.log.error(logTypes.fnInside({
                            "err": err,
                            newDN: newDN
                        }), "LDAP update failed using the credentials" + newDN);


                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "modifyDN - error",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return reject({err:err});
                    });
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                    "err": err,
                    rootDN: rootDN
                }), "LDAP Bind failed using the credentials");

                return reject({err:err});
            })
    });
}
function compare(newDN, attribute, value) {
    return new Promise(function(resolve, reject){

        createClient()
            .then(function(result){
                logging.general.log.info(logTypes.fnEnter({
                }), "Entering LDAP compare function");
                let ldapStartTime = new Date();
                ldapClient.compareAsync(newDN, attribute, value)
                    .then(function(result){
                        logging.general.log.debug(logTypes.fnInside({
                            newDN: newDN
                        }), "LDAP compare success using "+ newDN);

                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "compare",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return resolve(result);
                    })
                    .catch(function(err){
                        logging.general.log.error(logTypes.fnInside({
                            "err": err,
                            newDN: newDN
                        }), "LDAP compare failed using the credentials" + newDN);


                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "compare - error",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return reject({err:err});
                    });
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                    "err": err,
                    rootDN: rootDN
                }), "LDAP Bind failed using the credentials");

                return reject({err:err});
            })
    });
}
function delUser(newDN) {
    return new Promise(function(resolve, reject){

        createClient()
            .then(function(result){
                logging.general.log.info(logTypes.fnEnter({
                }), "Entering LDAP delete function");
                
                let ldapStartTime = new Date();
                ldapClient.delAsync(newDN)
                    .then(function(result){
                        logging.general.log.debug(logTypes.fnInside({
                        newDN: newDN
                    }), "LDAP delete success using " + newDN);


                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "delUser",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return resolve({success : "delete action successful"});
                    })
                    .catch(function(err){
                        logging.general.log.error(logTypes.fnInside({
                        "err": err,
                        newDN: newDN
                    }), "LDAP delete failed using the credentials" + newDN );


                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "delUser - error",
                            ldapDN: newDN,
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), `LDAP DN '${newDN}' took: ` + ldapTimeElapsed + ` milliseconds`);

                        return reject({err:err});
                    });
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                "err": err,
                newDN: newDN
                }), "LDAP Bind failed using the credentials");

                return reject({err:err});
            })
    });
}
///////////////////////////// Exposed Functions /////////////////////////////

///////////////////////////// Local Functions /////////////////////////////
function bind(baseDN, secret) {
    return new Promise(function(resolve, reject){
        logging.general.log.info(logTypes.fnEnter({
        }), "Entering LDAP bind function");

        let ldapStartTime = new Date();

        createClient()
            .then(function(result){

                ldapClient.bindAsync(rootDN, rootSecret)
                    .then(function(result){
                        logging.general.log.debug(logTypes.fnInside({
                        rootDN: rootDN
                        }), "LDAP Bind success using baseDN");
                        
                        let ldapEndTime = new Date();
                        let ldapTimeElapsed = ldapEndTime - ldapStartTime;

                        logging.performance.log.info(logTypes.performance("ldap", {
                            ldapOperation: "LDAP Binding",
                            ldapStartTime: ldapStartTime,
                            ldapEndTime: ldapEndTime,
                            ldapTimeElapsed: ldapTimeElapsed
                        }), "Binding to LDAP took: " + ldapTimeElapsed + " milliseconds");


                        return resolve({success : "binding successful"});
                    })
                    .catch(function(err){
                        logging.general.log.error(logTypes.fnInside({
                        "err": err,
                        rootDN: rootDN
                        }), "LDAP Bind failed using the credentials");

                        return reject(Boom.create(400, 'ldapClient.bindAsync', app_config_constants.get('/NODE_CODES/LDAP_DOWN')));
                    })
            })
            .catch(function(err){
                logging.general.log.error(logTypes.fnInside({
                    "err": err,
                    rootDN: rootDN
                    }), "LDAP Client failed using " + rootDN);

                    return reject(Boom.create(400, 'ldapClient.bindAsync', app_config_constants.get('/NODE_CODES/LDAP_DOWN')));
            })
    })       
}
function createClient() {
    return new Promise(function(resolve, reject){
        logging.general.log.info(logTypes.fnEnter({
            //params: params
        }), "Entering ldap.createClient");

        ldapClient = ldap.createClient(ldapOptions);
        Promise.promisifyAll(ldapClient);
        ldapClient.on('connect', function (connection) {

            return resolve(ldapClient);
        });
        ldapClient.on('reject', function (err) {
            logging.general.log.error(logTypes.fnInside({
                "err": err,
                ldapHostUrl: ldapHostUrl
            }), "Error creating the client using the credentials");
            return reject(Boom.create(400, 'ldapClient.createClient', app_config_constants.get('/NODE_CODES/LDAP_DOWN')));
        });
        ldapClient.on('uncaughtException', function (err) {
            logging.general.log.error(logTypes.fnInside({
                "err": err,
                ldapHostUrl: ldapHostUrl
            }), "Error creating the client using the credentials");
            return reject(Boom.create(400, 'ldapClient.createClient', app_config_constants.get('/NODE_CODES/LDAP_DOWN')));
        });
        ldapClient.on('error', function (err) {
            logging.general.log.error(logTypes.fnInside({
                "err": err,
                ldapHostUrl: ldapHostUrl
            }), "Error creating the client using the credentials");
            return reject(Boom.create(400, 'ldapClient.createClient', app_config_constants.get('/NODE_CODES/LDAP_DOWN')));
        });
    });
}
///////////////////////////// Local Functions /////////////////////////////

module.exports = function(appConfig) {
    _appConfig = appConfig;
    // LDAP server info
    ldapHostKey =  _appConfig.settings.get('/LDAP/ENDPOINT'),
    ldapHostServer = _appConfig.settings.get('/LDAP/ENDPOINT_LIST')[ldapHostKey];
    ldapHost = _appConfig.settings.get('/LDAP/LDAPHOST_LIST')[ldapHostKey],
    ldapPort = _appConfig.settings.get('/LDAP/TLSPORT'),
    ldapCertPath = _appConfig.settings.get('/LDAP/LDAPCERT'), // x.509 cert
    requestCert = _appConfig.settings.get('/LDAP/REQUEST_CERTIFICATE'),
    rejectUnauthorized = _appConfig.settings.get('/LDAP/REJECT_UNAUTHORIZED');
   
    return {
        getUser: searchUser,
        addUser: addUser,
        updateUser: modifyUser,
        delUser: delUser,
        updateUsername: modifyDN,
        searchUser: searchUser,
        multiDelUser: multiDelUser,
        simplifiedSearch: simplifiedSearch,
        compareAttribute: compare
    };
}

