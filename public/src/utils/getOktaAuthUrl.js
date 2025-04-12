export const continueWithOktaOauth = () => {
  const oktaClientId = process.env.REACT_APP_OKTA_CLIENT_ID;
  const oktaIssuer = process.env.REACT_APP_OKTA_ISSUER;
  const redirectUri = process.env.REACT_APP_OKTA_REDIRECT_URI;

  const authUrl = new URL(`${oktaIssuer}/v1/authorize`);
  authUrl.searchParams.append("client_id", oktaClientId);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", "openid profile email");
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("state", "state-token");

  return authUrl.toString();
};
