/* Optional runtime override of the API URL, e.g.
   window.__APIX_CONFIG__ = { apiUrl: "https://api.example.org" };
   Replace this file at deploy time; see infra/docker/web.Dockerfile. */
window.__APIX_CONFIG__ = window.__APIX_CONFIG__ || {};
