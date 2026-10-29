const express = require("express");
const {
    registerFarmer,
    registerCustomer, addCrop,
    getFarmerCrops,
    getCrops,
    placeOrder,
    previewFirstOrderDiscount,
    getFarmerNotifications,
    getCustomerOrders,
    getFarmerOrders,
    markOrderDelivered,
    verifyOTP,
    sendOTP,
    forgotPassword,
    verifyForgotPasswordOTP,
    resetPassword
} = require("./controller");
const { createPayment, verifyPayment } = require("./paymentController");
const { signin } = require("./signincontroller");

const router = express.Router();

router.post("/farmer/register", registerFarmer);

router.post("/customer/register", registerCustomer);
router.post("/crop/add", addCrop);
router.post("/signin", signin);
router.get("/crops/farmer/:farmerId", getFarmerCrops);
router.get("/crops", getCrops);
router.post("/order/place", placeOrder);
router.post("/discount/first-order/preview", previewFirstOrderDiscount);
router.get("/notifications/farmer/:farmerId", getFarmerNotifications);
router.get("/orders/customer/:customerId", getCustomerOrders);
router.get("/orders/farmer/:farmerId",getFarmerOrders);
router.put("/order/delivered/:orderId",markOrderDelivered);

router.put("/order/delivered/:orderId", markOrderDelivered);
router.post("/verify-otp", verifyOTP);
router.post("/send-otp", sendOTP);
router.post("/forgot-password", forgotPassword);
router.post("/verify-forgot-password-otp",verifyForgotPasswordOTP);
router.post("/reset-password",resetPassword);

router.post("/payment/create", createPayment);
router.post("/payment/verify", verifyPayment);

module.exports = router;