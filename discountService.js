const MINIMUM_SUBTOTAL_CENTS = 50000;
const DISCOUNT_PERCENTAGE = 10;
const COMPLETED_ORDER_STATUS = "Delivered";
const MAX_QUANTITY = 1000000;

const isValidObjectId = (value) =>
    typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

const toCents = (amount) => Math.round(
    Number(amount) * 100 +
    Number.EPSILON * Math.max(1, Math.abs(Number(amount) * 100))
);

const parseQuantity = (value) => {
    if (
        (typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && value.trim() === "")
    ) {
        return null;
    }

    const quantity = Number(value);
    if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        quantity > MAX_QUANTITY
    ) {
        return null;
    }

    return quantity;
};

const calculateFirstOrderDiscount = ({
    unitPrice,
    quantity,
    hasCompletedOrder
}) => {
    const price = Number(unitPrice);
    const qty = parseQuantity(quantity);

    if (!Number.isFinite(price) || price <= 0 || qty === null) {
        throw new TypeError("A valid unit price and quantity are required");
    }

    const unitPriceCents = toCents(price);
    const subtotalCents = Math.round(
        unitPriceCents * qty +
        Number.EPSILON * Math.max(1, Math.abs(unitPriceCents * qty))
    );
    const discountEligible =
        !hasCompletedOrder && subtotalCents >= MINIMUM_SUBTOTAL_CENTS;
    const discountCents = discountEligible
        ? Math.round(subtotalCents * DISCOUNT_PERCENTAGE / 100)
        : 0;

    return {
        eligible: discountEligible,
        subtotal: subtotalCents / 100,
        discountPercentage: discountEligible ? DISCOUNT_PERCENTAGE : 0,
        discountAmount: discountCents / 100,
        finalAmount: (subtotalCents - discountCents) / 100,
        reason: hasCompletedOrder
            ? "Customer has already completed an order"
            : subtotalCents < MINIMUM_SUBTOTAL_CENTS
                ? "Minimum crop subtotal of ₹500 is required"
                : null
    };
};

module.exports = {
    COMPLETED_ORDER_STATUS,
    calculateFirstOrderDiscount,
    isValidObjectId,
    parseQuantity,
    toCents
};
