package com.tekpas.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientIpTest {

    static MockHttpServletRequest request(String forwardedFor) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.9");
        if (forwardedFor != null) {
            request.addHeader("X-Forwarded-For", forwardedFor);
        }
        return request;
    }

    @Test
    void readsFromTheRightSkippingOurProxies() {
        ClientIp oneProxy = new ClientIp(1);

        assertThat(oneProxy.of(request("203.0.113.5, 10.0.0.1"))).isEqualTo("203.0.113.5");
        // Whatever the client put in front does not matter.
        assertThat(oneProxy.of(request("198.51.100.7, 203.0.113.5, 10.0.0.1"))).isEqualTo("203.0.113.5");
        assertThat(oneProxy.of(request("10.0.0.1"))).isNull();
        assertThat(oneProxy.of(request(null))).isNull();
    }

    @Test
    void zeroUsesTheSocketAndANegativeValueTurnsItOff() {
        assertThat(new ClientIp(0).of(request("203.0.113.5, 10.0.0.1"))).isEqualTo("10.0.0.9");
        assertThat(new ClientIp(-1).of(request("203.0.113.5, 10.0.0.1"))).isNull();
    }
}
