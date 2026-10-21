package com.tekpas.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.data.jpa.repository.query.DeclaredQuery;
import org.springframework.data.jpa.repository.query.QueryEnhancerFactories;
import org.springframework.data.jpa.repository.query.QueryEnhancerFactory;
import org.springframework.data.jpa.repository.query.QueryEnhancerSelector;

/**
 * Experiment (M10 T5): the regex query enhancer for {@code @Query} strings instead of the ANTLR HQL parser, which
 * parses every query at startup.
 */
@Configuration(proxyBeanMethods = false)
@EnableJpaRepositories(basePackages = "com.tekpas", queryEnhancerSelector = JpaRepositoriesConfig.Regex.class)
class JpaRepositoriesConfig {

    public static class Regex implements QueryEnhancerSelector {

        @Override
        public QueryEnhancerFactory select(DeclaredQuery query) {
            return QueryEnhancerFactories.fallback();
        }
    }
}
