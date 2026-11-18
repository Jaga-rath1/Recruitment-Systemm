'use strict';

const dns = require('dns');

if (dns && dns.lookup && !global.__DNS_FALLBACK_INITIALIZED__) {
  global.__DNS_FALLBACK_INITIALIZED__ = true;
  const origLookup = dns.lookup;
  dns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    origLookup(hostname, options, (err, address, family) => {
      if (err && (err.code === 'ENOTFOUND' || err.code === 'EREFUSED' || err.code === 'EAI_AGAIN')) {
        const resolver = new dns.Resolver();
        resolver.setServers(['8.8.8.8', '1.1.1.1']);
        resolver.resolve4(hostname, (resErr, addresses) => {
          if (!resErr && addresses && addresses.length > 0) {
            if (options && options.all) {
              return callback(null, addresses.map((a) => ({ address: a, family: 4 })));
            }
            return callback(null, addresses[0], 4);
          }
          return callback(err, address, family);
        });
        return;
      }
      return callback(err, address, family);
    });
  };
}

module.exports = {};
