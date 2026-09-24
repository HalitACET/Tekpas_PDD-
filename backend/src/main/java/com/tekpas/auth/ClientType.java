package com.tekpas.auth;

/** WEB receives the refresh token as an httpOnly cookie, MOBILE in the response body. */
public enum ClientType {
    WEB,
    MOBILE
}
