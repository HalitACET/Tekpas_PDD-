# syntax=docker/dockerfile:1
# TekPas backend for Render free (512 MB RAM, 0.1 CPU). Build context: backend/
# Tests are not run here: CI runs them before Render deploys (autoDeployTrigger: checksPass).

# ---- build ------------------------------------------------------------------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src

# Dependencies in their own layer: only re-downloaded when pom.xml or the wrapper changes,
# so a code-only change skips this step (Render pipeline minutes are limited).
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -ntp -q dependency:go-offline

COPY src/ src/
RUN ./mvnw -B -ntp -q package -DskipTests \
    && cp target/tekpas-backend-*.jar app.jar \
    && java -Djarmode=tools -jar app.jar extract --destination /app

# ---- run --------------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S -G app app && chown app:app /app
COPY --from=build --chown=app:app /app/ /app/
USER app

# 512 MB container: heap up to 75 %, the rest for metaspace, code cache, thread stacks and native memory.
# SerialGC: smallest footprint for one CPU. C1 only (TieredStopAtLevel=1): much faster startup on 0.1 CPU.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m \
-XX:ReservedCodeCacheSize=64m -Xss512k -XX:TieredStopAtLevel=1 -XX:+ExitOnOutOfMemoryError"

# Class Data Sharing archive (startup on 0.1 CPU): a training run starts the prod context and exits
# right after refresh, recording the loaded classes. No database exists at build time, so Flyway is off,
# Hibernate does not read JDBC metadata, and required settings get throwaway placeholder values that are
# used for this run only (the real ones come from Render's environment at runtime).
RUN java -XX:ArchiveClassesAtExit=/app/app.jsa -Dspring.context.exit=onRefresh \
    -Dspring.profiles.active=prod \
    -Dspring.datasource.url='jdbc:postgresql://127.0.0.1:1/cds-training?sslmode=require' \
    -Dspring.datasource.username=cds-training -Dspring.datasource.password=cds-training \
    -Dtekpas.jwt.secret=cds-training-placeholder-not-used-at-runtime \
    -Dspring.flyway.enabled=false -Dspring.jpa.hibernate.ddl-auto=none \
    -Dspring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false \
    -Dspring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect \
    -jar /app/app.jar

ENV SPRING_PROFILES_ACTIVE=prod
EXPOSE 8080
ENTRYPOINT ["java", "-XX:SharedArchiveFile=/app/app.jsa", "-jar", "/app/app.jar"]
