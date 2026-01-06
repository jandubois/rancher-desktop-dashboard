import { importTypes } from '@rancher/auto-import';
import { IInternal, IPlugin } from '@shell/core/types';
import Socket from '@shell/utils/socket';

// Init the package
export default function(plugin: IPlugin, internal: IInternal): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  const { $axios, store, app: { router } } = internal;

  interceptApiRequest($axios);
  interceptWebSocketUrls();

  let logoRoute = router.resolve({
    name: 'c-cluster-explorer',
    params: { cluster: "local" },
  });

  store.commit('setIsSingleProduct', {
    productNameKey: 'rancher-desktop.label',
    logoRoute,
    logo: require(`./assets/logo.svg`),
  });
}

/**
 * Intercepts requests to rewrite URLs. This is useful intercepting any direct
 * API calls when running dashboard with a proxy server.
 *
 * NOTE: This is currently used for running Dashboard in Rancher Desktop.
 * @param {*} axios The axios instance to modify
 */
const interceptApiRequest = (axios: any) => {
  axios.interceptors.request.use((config: any) => {
    // ensure that http traffic to properly route to the proxy server
    if (config.url.includes(':6120')) {
      config.url = config.url
        .replace('https://', 'http://');
    }

    if (config.url.includes(':9443')) {
      config.url = config.url
        .replace('https://', 'http://')
        .replace(':9443', ':6120');
    }

    return config;
  }, (error: any) => {
    return Promise.reject(error);
  });
};

/**
 * Intercepts WebSocket URL construction to rewrite URLs for the proxy server.
 *
 * The dashboard runs on http://127.0.0.1:6120 (HTTP proxy) which proxies to
 * https://127.0.0.1:9443 (Kubernetes API with TLS). WebSocket connections for
 * pod logs/shell need to use ws:// (not wss://) when going through the proxy.
 *
 * This fixes issue #3212 where newly created pods fail to show logs because
 * their WebSocket URLs use wss:// on the HTTP proxy port.
 */
const interceptWebSocketUrls = () => {
  const originalSetUrl = Socket.prototype.setUrl;

  Socket.prototype.setUrl = function(url: string) {
    // Route WebSocket traffic through the HTTP proxy on port 6120
    // Convert wss://127.0.0.1:6120 → ws://127.0.0.1:6120
    if (url.includes(':6120')) {
      url = url.replace('wss://', 'ws://');
    }

    // Route direct API connections through the proxy
    // Convert wss://127.0.0.1:9443 → ws://127.0.0.1:6120
    if (url.includes(':9443')) {
      url = url
        .replace('wss://', 'ws://')
        .replace(':9443', ':6120');
    }

    return originalSetUrl.call(this, url);
  };
};
