// app.json holds the configuration; this file only adds what differs per machine (docs/mobil-push-kurulumu.md).
// Firebase's google-services.json stays out of git: on EAS Build it comes from the secret file variable
// GOOGLE_SERVICES_JSON, locally from mobile/google-services.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
});
