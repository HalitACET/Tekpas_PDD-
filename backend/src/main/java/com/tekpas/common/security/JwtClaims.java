package com.tekpas.common.security;

/** Claim names shared by the token issuer and {@link CurrentUser}. */
public final class JwtClaims {

    public static final String ISSUER = "tekpas";
    public static final String COMPANY_ID = "cid";
    public static final String ROLE = "role";

    private JwtClaims() {
    }
}
