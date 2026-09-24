package com.tekpas;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class TekpasApplication {

    public static void main(String[] args) {
        SpringApplication.run(TekpasApplication.class, args);
    }
}
