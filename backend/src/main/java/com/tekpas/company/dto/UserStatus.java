package com.tekpas.company.dto;

/**
 * Where a user's account stands (design brief v1.2 160): ACTIVE logs in; INVITED has a valid invitation link;
 * INVITATION_EXPIRED has a link that ran out (renew it); INACTIVE was deactivated.
 */
public enum UserStatus { ACTIVE, INVITED, INVITATION_EXPIRED, INACTIVE }
