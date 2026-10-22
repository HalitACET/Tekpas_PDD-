package com.tekpas.product.care;

/**
 * The care symbols the product form offers (design v1.0 120a, after ISO 3758), each in one category and with the
 * gentlest treatment it can carry: temperature washes take one or two bars, P, F and W one, the others none.
 */
public enum CareSymbol {
    WASH_30(CareCategory.WASHING, Gentleness.VERY_GENTLE),
    WASH_40(CareCategory.WASHING, Gentleness.VERY_GENTLE),
    WASH_60(CareCategory.WASHING, Gentleness.VERY_GENTLE),
    WASH_95(CareCategory.WASHING, Gentleness.VERY_GENTLE),
    HAND_WASH(CareCategory.WASHING, Gentleness.NORMAL),
    DO_NOT_WASH(CareCategory.WASHING, Gentleness.NORMAL),

    BLEACH_ANY(CareCategory.BLEACHING, Gentleness.NORMAL),
    BLEACH_OXYGEN_ONLY(CareCategory.BLEACHING, Gentleness.NORMAL),
    DO_NOT_BLEACH(CareCategory.BLEACHING, Gentleness.NORMAL),

    TUMBLE_DRY_LOW(CareCategory.DRYING, Gentleness.NORMAL),
    TUMBLE_DRY_NORMAL(CareCategory.DRYING, Gentleness.NORMAL),
    DO_NOT_TUMBLE_DRY(CareCategory.DRYING, Gentleness.NORMAL),
    LINE_DRY(CareCategory.DRYING, Gentleness.NORMAL),
    DRY_FLAT(CareCategory.DRYING, Gentleness.NORMAL),
    DRY_IN_SHADE(CareCategory.DRYING, Gentleness.NORMAL),

    IRON_LOW(CareCategory.IRONING, Gentleness.NORMAL),
    IRON_MEDIUM(CareCategory.IRONING, Gentleness.NORMAL),
    IRON_HIGH(CareCategory.IRONING, Gentleness.NORMAL),
    DO_NOT_IRON(CareCategory.IRONING, Gentleness.NORMAL),

    DRY_CLEAN_P(CareCategory.PROFESSIONAL, Gentleness.GENTLE),
    DRY_CLEAN_F(CareCategory.PROFESSIONAL, Gentleness.GENTLE),
    WET_CLEAN(CareCategory.PROFESSIONAL, Gentleness.GENTLE),
    DO_NOT_PROFESSIONAL_CLEAN(CareCategory.PROFESSIONAL, Gentleness.NORMAL);

    private final CareCategory category;
    private final Gentleness gentlest;

    CareSymbol(CareCategory category, Gentleness gentlest) {
        this.category = category;
        this.gentlest = gentlest;
    }

    public CareCategory category() {
        return category;
    }

    public boolean allows(Gentleness gentleness) {
        return gentleness.ordinal() <= gentlest.ordinal();
    }
}
