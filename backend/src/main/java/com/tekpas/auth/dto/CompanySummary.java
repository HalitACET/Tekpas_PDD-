package com.tekpas.auth.dto;

import com.tekpas.company.Company;
import com.tekpas.company.CompanyType;
import java.util.UUID;

public record CompanySummary(UUID id, String name, CompanyType type) {

    public static CompanySummary from(Company company) {
        return new CompanySummary(company.getId(), company.getName(), company.getType());
    }
}
