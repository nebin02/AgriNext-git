const test = require("node:test");
const assert = require("node:assert/strict");
const {
    calculateFirstOrderDiscount,
    isValidObjectId,
    parseQuantity,
    toCents
} = require("../discountService");
const Customer = require("../customerschema");
const Farmer = require("../farmerschema");
const Crop = require("../cropschema");
const Order = require("../orderschema");
const Notification = require("../notificationschema");
const {
    markOrderDelivered,
    placeOrder,
    previewFirstOrderDiscount
} = require("../controller");

const mockResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

const replaceMethod = (object, name, replacement) => {
    const original = object[name];
    object[name] = replacement;
    return () => {
        object[name] = original;
    };
};

test("first order discount is 10% for an ₹800 eligible subtotal", () => {
    assert.deepEqual(
        calculateFirstOrderDiscount({
            unitPrice: 400,
            quantity: 2,
            hasCompletedOrder: false
        }),
        {
            eligible: true,
            subtotal: 800,
            discountPercentage: 10,
            discountAmount: 80,
            finalAmount: 720,
            reason: null
        }
    );
});

test("first order discount applies at the ₹500 minimum", () => {
    const pricing = calculateFirstOrderDiscount({
        unitPrice: 250,
        quantity: 2,
        hasCompletedOrder: false
    });

    assert.equal(pricing.subtotal, 500);
    assert.equal(pricing.discountAmount, 50);
    assert.equal(pricing.finalAmount, 450);
});

test("first order discount does not apply below the minimum", () => {
    const pricing = calculateFirstOrderDiscount({
        unitPrice: 499,
        quantity: 1,
        hasCompletedOrder: false
    });

    assert.equal(pricing.eligible, false);
    assert.equal(pricing.discountPercentage, 0);
    assert.equal(pricing.discountAmount, 0);
    assert.equal(pricing.finalAmount, 499);
    assert.match(pricing.reason, /₹500/);
});

test("completed customers receive no discount", () => {
    const pricing = calculateFirstOrderDiscount({
        unitPrice: 800,
        quantity: 1,
        hasCompletedOrder: true
    });

    assert.equal(pricing.eligible, false);
    assert.equal(pricing.discountAmount, 0);
    assert.equal(pricing.finalAmount, 800);
    assert.match(pricing.reason, /completed/);
});

test("pending-order customers remain eligible if no order is completed", () => {
    const pricing = calculateFirstOrderDiscount({
        unitPrice: 500,
        quantity: 1,
        hasCompletedOrder: false
    });

    assert.equal(pricing.eligible, true);
    assert.equal(pricing.discountAmount, 50);
});

test("price and discount fields supplied by a caller cannot change server pricing", () => {
    const pricing = calculateFirstOrderDiscount({
        unitPrice: 400,
        quantity: 2,
        hasCompletedOrder: false,
        subtotal: 1,
        discount: 9999,
        totalAmount: 0,
        isFirstOrder: false
    });

    assert.equal(pricing.subtotal, 800);
    assert.equal(pricing.discountAmount, 80);
    assert.equal(pricing.finalAmount, 720);
});

test("customer IDs, crop IDs, and quantities are strictly validated", () => {
    assert.equal(isValidObjectId("507f1f77bcf86cd799439011"), true);
    assert.equal(isValidObjectId("not-an-object-id"), false);
    assert.equal(isValidObjectId(507), false);

    for (const value of [0, -1, NaN, Infinity, " ", "abc", {}, null, 1000001]) {
        assert.equal(parseQuantity(value), null);
    }
    assert.equal(parseQuantity("2.5"), 2.5);
});

test("money amounts are rounded to two decimal places", () => {
    const pricing = calculateFirstOrderDiscount({
        unitPrice: 123.456,
        quantity: 2,
        hasCompletedOrder: false
    });

    assert.equal(pricing.subtotal, 246.92);
    assert.equal(pricing.discountAmount, 0);
    assert.equal(pricing.finalAmount, 246.92);
    assert.equal(toCents(1.005), 101);
});

test("COD order stores server pricing and ignores client price fields", async () => {
    const customerId = "507f1f77bcf86cd799439011";
    const farmerId = "507f1f77bcf86cd799439012";
    const cropId = "507f1f77bcf86cd799439013";
    let savedOrder;
    const restore = [
        replaceMethod(Customer, "findById", async () => ({
            _id: customerId,
            name: "Customer",
            phone: "9876543210",
            email: "customer@example.test"
        })),
        replaceMethod(Farmer, "findById", async () => ({ _id: farmerId })),
        replaceMethod(Crop, "findById", async () => ({
            _id: cropId,
            farmerId: { toString: () => farmerId },
            cropName: "Wheat",
            price: 400,
            quantity: 5,
            unit: "kg"
        })),
        replaceMethod(Crop, "findOneAndUpdate", async () => ({ quantity: 3 })),
        replaceMethod(Order, "exists", async () => null),
        replaceMethod(Order, "create", async (order) => {
            savedOrder = order;
            return { ...order, _id: "order-id" };
        }),
        replaceMethod(Notification, "create", async () => ({ _id: "notification-id" }))
    ];

    try {
        const response = mockResponse();
        await placeOrder({
            body: {
                customerId,
                farmerId,
                cropId,
                quantity: 2,
                address: "Farm road",
                paymentMethod: "COD",
                price: 0.01,
                subtotal: 1,
                discount: 9999,
                totalAmount: 0,
                isFirstOrder: false
            }
        }, response);

        assert.equal(response.statusCode, 201);
        assert.equal(savedOrder.subtotal, 800);
        assert.equal(savedOrder.discountPercentage, 10);
        assert.equal(savedOrder.discountAmount, 80);
        assert.equal(savedOrder.finalAmount, 720);
        assert.equal(savedOrder.totalAmount, 720);
        assert.equal(toCents(savedOrder.totalAmount), 72000);
    } finally {
        restore.reverse().forEach((restoreMethod) => restoreMethod());
    }
});

test("discount preview queries the real completed status and returns its pricing shape", async () => {
    const customerId = "507f1f77bcf86cd799439021";
    const cropId = "507f1f77bcf86cd799439022";
    let searchedStatus;
    const restore = [
        replaceMethod(Customer, "findById", async () => ({ _id: customerId })),
        replaceMethod(Crop, "findById", async () => ({
            price: 400,
            quantity: 5
        })),
        replaceMethod(Order, "exists", async (query) => {
            searchedStatus = query.orderStatus;
            return null;
        })
    ];

    try {
        const response = mockResponse();
        await previewFirstOrderDiscount({
            body: { customerId, cropId, quantity: 2 }
        }, response);

        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, {
            eligible: true,
            subtotal: 800,
            discountPercentage: 10,
            discountAmount: 80,
            finalAmount: 720,
            reason: null
        });
        assert.equal(searchedStatus, "Delivered");
    } finally {
        restore.reverse().forEach((restoreMethod) => restoreMethod());
    }
});

test("unverified UPI orders cannot be marked delivered", async () => {
    let saved = false;
    const restore = replaceMethod(Order, "findById", async () => ({
        paymentMethod: "UPI",
        paymentStatus: "Pending",
        orderStatus: "Pending",
        save: async () => {
            saved = true;
        }
    }));

    try {
        const response = mockResponse();
        await markOrderDelivered({
            params: { orderId: "507f1f77bcf86cd799439014" }
        }, response);

        assert.equal(response.statusCode, 400);
        assert.equal(saved, false);
    } finally {
        restore();
    }
});
