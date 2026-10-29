const crypto = require("crypto");
const Razorpay = require("razorpay");
const Order = require("./orderschema");
const { isValidObjectId, toCents } = require("./discountService");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const createPayment = async (req, res) => {
    try {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({
                success: false,
                message: "Request body must be a JSON object"
            });
        }
        const { customerId, orderId } = req.body;
        if (!isValidObjectId(customerId) || !isValidObjectId(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Valid customer ID and order ID are required"
            });
        }

        const order = await Order.findOne({ _id: orderId, customerId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (order.paymentMethod !== "UPI") {
            return res.status(400).json({ success: false, message: "Order is not a UPI order" });
        }
        if (order.paymentStatus !== "Pending") {
            return res.status(409).json({ success: false, message: "Order is not awaiting payment" });
        }

        if (order.razorpayOrderId) {
            const existingPaymentOrder = await razorpay.orders.fetch(order.razorpayOrderId);
            return res.status(200).json({ success: true, order: existingPaymentOrder });
        }

        const amount = toCents(order.totalAmount);
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: "Order amount is invalid" });
        }

        const paymentOrder = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: `agri_${order._id}`
        });
        const update = await Order.updateOne(
            { _id: order._id, customerId, paymentStatus: "Pending", razorpayOrderId: null },
            { $set: { razorpayOrderId: paymentOrder.id } }
        );

        if (update.modifiedCount !== 1) {
            const currentOrder = await Order.findOne({ _id: order._id, customerId });
            if (currentOrder?.razorpayOrderId) {
                const existingPaymentOrder = await razorpay.orders.fetch(currentOrder.razorpayOrderId);
                return res.status(200).json({ success: true, order: existingPaymentOrder });
            }
            return res.status(409).json({
                success: false,
                message: "Order payment state changed; retry payment creation"
            });
        }

        return res.status(200).json({ success: true, order: paymentOrder });
    } catch (error) {
        console.error("RAZORPAY ORDER CREATION ERROR", error.name);
        return res.status(500).json({
            success: false,
            message: "Payment order creation failed"
        });
    }
};

const verifyPayment = async (req, res) => {
    try {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({
                success: false,
                message: "Request body must be a JSON object"
            });
        }
        const {
            customerId,
            orderId,
            razorpay_order_id: paymentOrderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature
        } = req.body;

        if (
            !isValidObjectId(customerId) ||
            !isValidObjectId(orderId) ||
            typeof paymentOrderId !== "string" ||
            typeof paymentId !== "string" ||
            typeof signature !== "string" ||
            !paymentId ||
            !/^[a-f\d]{64}$/i.test(signature)
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid customer, order, and Razorpay payment details are required"
            });
        }

        const order = await Order.findOne({ _id: orderId, customerId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (
            order.paymentMethod !== "UPI" ||
            !order.razorpayOrderId ||
            order.razorpayOrderId !== paymentOrderId
        ) {
            return res.status(400).json({ success: false, message: "Payment does not match this order" });
        }

        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json({
                success: false,
                message: "Payment verification is not configured"
            });
        }
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${order.razorpayOrderId}|${paymentId}`)
            .digest();
        const receivedSignature = Buffer.from(signature, "hex");
        if (
            expectedSignature.length !== receivedSignature.length ||
            !crypto.timingSafeEqual(expectedSignature, receivedSignature)
        ) {
            return res.status(400).json({ success: false, message: "Payment signature verification failed" });
        }

        const expectedAmount = toCents(order.totalAmount);
        let payment = await razorpay.payments.fetch(paymentId);
        if (
            payment.order_id !== order.razorpayOrderId ||
            payment.amount !== expectedAmount ||
            payment.currency !== "INR"
        ) {
            return res.status(400).json({
                success: false,
                message: "Payment details do not match the order"
            });
        }
        if (payment.status === "authorized") {
            payment = await razorpay.payments.capture(paymentId, expectedAmount, "INR");
        }
        if (
            payment.status !== "captured" ||
            payment.order_id !== order.razorpayOrderId ||
            payment.amount !== expectedAmount ||
            payment.currency !== "INR"
        ) {
            return res.status(409).json({
                success: false,
                message: "Payment has not been captured"
            });
        }

        if (order.paymentStatus === "Paid" && order.razorpayPaymentId === paymentId) {
            return res.status(200).json({
                success: true,
                message: "Payment already verified",
                order
            });
        }
        if (order.paymentStatus !== "Pending") {
            return res.status(409).json({ success: false, message: "Order is not awaiting payment" });
        }

        const updatedOrder = await Order.findOneAndUpdate(
            {
                _id: order._id,
                customerId,
                paymentStatus: "Pending",
                razorpayOrderId: paymentOrderId
            },
            { $set: { paymentStatus: "Paid", razorpayPaymentId: paymentId } },
            { new: true }
        );
        if (!updatedOrder) {
            return res.status(409).json({ success: false, message: "Order payment state changed" });
        }

        return res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            order: updatedOrder
        });
    } catch (error) {
        console.error("RAZORPAY PAYMENT VERIFICATION ERROR", error.name);
        return res.status(500).json({
            success: false,
            message: "Payment verification failed"
        });
    }
};

module.exports = { createPayment, verifyPayment };
