package com.tekpas.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.data.jpa.repository.query.DeclaredQuery;
import org.springframework.data.jpa.repository.query.QueryEnhancerFactories;
import org.springframework.data.jpa.repository.query.QueryEnhancerFactory;
import org.springframework.data.jpa.repository.query.QueryEnhancerSelector;

/**
 * Spring Data JPA's regex query enhancer for {@code @Query} strings instead of its ANTLR HQL parser, which parses
 * every query at startup: on Render's 0.1 CPU that was the most expensive single step, and the first answer after a
 * cold start comes about 13 % sooner without it (docs/m10-acilis-olcumu.md). The enhancer only adds sorting and
 * derives count queries; the paged queries bring their own {@code countQuery}, and sort fields are whitelisted per
 * endpoint ({@code PageQuery}). Hibernate still validates every query at startup.
 */
@Configuration(proxyBeanMethods = false)
@EnableJpaRepositories(basePackages = "com.tekpas", queryEnhancerSelector = JpaRepositoriesConfig.Regex.class)
class JpaRepositoriesConfig {

    /** Instantiated by Spring Data, hence public with a public no-argument constructor. */
    public static class Regex implements QueryEnhancerSelector {

        @Override
        public QueryEnhancerFactory select(DeclaredQuery query) {
            return QueryEnhancerFactories.fallback();
        }
    }
}
