package com.tekpas.demo;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code DEMO_PASSWORD}: shared password of the demo users. Blank = no demo data. */
@ConfigurationProperties("tekpas.demo")
public record DemoProperties(String password) {

    public boolean hasPassword() {
        return password != null && !password.isBlank();
    }

    @Override
    public String toString() {
        return "DemoProperties[password=***]";
    }
}
