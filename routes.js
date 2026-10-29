const express = require("express");
const { upload, validateImageContent } = require("./upload");
const {
    sendOTP,
    addCrop,
    getFarmerCrops,
    getCrops,
    placeOrder,
    previewFirstOrderDiscount,
    getFarmerNotifications,
    getCustomerOrders,
    getFarmerOrders,
    markOrderDelivered,
    verifyOTP,
    forgotPassword,
    verifyForgotPasswordOTP,
    resetPassword
} = require("./controller");
const { signin } = require("./signincontroller");

const router = express.Router();
const registerWithOtp = (userType) => (req, res, next) => {
    req.body = {
        ...(req.body || {}),
        userType
    };
    req.registrationRoute = true;
    return sendOTP(req, res, next);
};

const deferPaymentHandler = (handlerName) => (req, res, next) => {
    try {
        return require("./paymentController")[handlerName](req, res, next);
    } catch (error) {
        return next(error);
    }
};

router.post("/farmer/register", registerWithOtp("farmer"));

router.post("/customer/register", registerWithOtp("customer"));
router.post("/crop/add", upload.single("image"), validateImageContent, addCrop);
router.post("/signin", signin);
router.get("/crops/farmer/:farmerId", getFarmerCrops);
router.get("/crops", getCrops);
router.post("/order/place", placeOrder);
router.post("/discount/first-order/preview", previewFirstOrderDiscount);
router.get("/notifications/farmer/:farmerId", getFarmerNotifications);
router.get("/orders/customer/:customerId", getCustomerOrders);
router.get("/orders/farmer/:farmerId", getFarmerOrders);
router.put("/order/delivered/:orderId", markOrderDelivered);
router.post("/verify-otp", verifyOTP);
router.post("/send-otp", sendOTP);
router.post("/forgot-password", forgotPassword);
router.post("/verify-forgot-password-otp", verifyForgotPasswordOTP);
router.post("/reset-password", resetPassword);

router.post("/payment/create", deferPaymentHandler("createPayment"));
router.post("/payment/verify", deferPaymentHandler("verifyPayment"));

module.exports = router;