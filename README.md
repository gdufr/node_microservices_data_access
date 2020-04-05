## Synopsis

This module contains the Data Access Layer that will be used by the Service Layer. The DAL contains modules to make calls with SOAP, LDAP, etc.


## Initialization

```javascript
var dataAccess = require('data-access')(config);
```

Note: the () after the require statement is mandatory but the config object is optional.

This module can be bundled with its own set of default settings.js and constants.js. These settings and constants can be overridden by passing in an object containing one or both of these properties.

appConfig is an object with two properties: settings and constants. Both these two properties have a 'get' function that can be used to retrieve the setting/constant.

Example:

```javascript
var config = {
    "settings": {
        "CONNECTION_MODE": "HTTPS"
    },
    "constants": {
        "ESB_ERROR_CODE": "0000001"
    }
}

var dataAccess = require('data-access')(config);

```

The above will override the default settings and constant values.

## Usage

You can make a SOAP call by doing the following:


```javascript
var params = {
    service: "data",
    operation: "getData",
    input: {
        attribute1: val1,
        attribute2: val2
    }
}

dataAccess.soapCall(params, function(){
    // Callback function goes here
})



```

