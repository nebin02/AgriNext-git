
const Farmer = require("./farmerschema");
const Customer = require("./customerschema");
const Crop = require("./cropschema");
const sendOTPEmail = require("./emailService");
const PendingVerification = require("./pendingverificationschema");
const Order = require("./orderschema");
const Notification = require("./notificationschema");
const {
    COMPLETED_ORDER_STATUS,
    calculateFirstOrderDiscount,
    isValidObjectId,
    parseQuantity,
    toCents
} = require("./discountService");

// ===============================
// FARMER REGISTER
// ===============================

const registerFarmer = async (req, res) => {

    try {

        const {
            name,
            email,
            phone,
            password,
            address,
            farmLocation
        } = req.body;

        if (
            !name ||
            !email ||
            !phone ||
            !password ||
            !address ||
            !farmLocation
        ) {

            return res.status(400).json({
                message: "All fields are required"
            });

        }

        const existingFarmer = await Farmer.findOne({ email });

        if (existingFarmer) {

            return res.status(400).json({
                message: "Email already registered"
            });

        }

        // Generate 6 digit OTP
        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        // OTP expires after 5 minutes
        const otpExpires = new Date(
            Date.now() + 5 * 60 * 1000
        );

        const farmer = new Farmer({

            name,
            email,
            phone,
            password,
            address,
            farmLocation,

            otp,
            otpExpires,

            isVerified: false

        });

        await farmer.save();

        // Send OTP
        await sendOTPEmail(email, otp);

        res.status(201).json({

            message: "Registration successful. OTP sent to your email.",

            email: email,

            userType: "farmer"

        });

    } catch (error) {

        console.error("Farmer registration error:", error);

        res.status(500).json({
            message: "Registration failed"
        });

    }
};
// ===============================
// CUSTOMER REGISTER
// ===============================

const registerCustomer = async (req, res) => {

    try {

        const {
            name,
            email,
            phone,
            password,
            address
        } = req.body;

        if (!name || !email || !phone || !password || !address) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        const existingCustomer = await Customer.findOne({ email });

        if (existingCustomer) {

            return res.status(400).json({
                message: "Email already registered"
            });
        }

        // Generate 6 digit OTP
        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        // OTP valid for 5 minutes
        const otpExpires = new Date(
            Date.now() + 5 * 60 * 1000
        );

        const customer = new Customer({

            name,
            email,
            phone,
            password,
            address,

            otp,
            otpExpires,

            isVerified: false

        });

        await customer.save();

        // Send OTP
        await sendOTPEmail(email, otp);

        res.status(201).json({

            message: "Registration successful. OTP sent to your email.",

            email: email,

            userType: "customer"

        });

    } catch (error) {

        console.error("Customer registration error:", error);

        res.status(500).json({
            message: "Registration failed"
        });

    }
};

// ===============================
// ADD CROP
// ===============================

const addCrop = async (req, res) => {

    try {

        console.log("Received crop data:", req.body);

        const {
            farmerId,
            cropName,
            quantity,
            unit,
            price,
            location
        } = req.body;


        const newCrop = new Crop({

            farmerId: farmerId,
            cropName: cropName,
            quantity: quantity,
            unit: unit,
            price: price,
            location: location

        });


        await newCrop.save();


        console.log("Crop saved:", newCrop);


        return res.status(201).json({

            message: "Crop added successfully",

            crop: newCrop

        });

    } catch (error) {

        console.log("CROP ERROR:", error);

        return res.status(500).json({

            message: "Error adding crop",

            error: error.message

        });

    }

};
const getFarmerCrops = async (req, res) => {

    try {

        const { farmerId } = req.params;

        console.log("Getting crops for farmer:", farmerId);

        const crops = await Crop.find({
            farmerId: farmerId
        });

        return res.status(200).json({

            message: "Farmer crops fetched successfully",

            crops: crops

        });

    } catch (error) {

        console.log("FARMER CROPS ERROR:", error);

        return res.status(500).json({

            message: "Error fetching farmer crops",

            error: error.message

        });

    }

};
// const Crop = require("./cropschema");

const getCrops = async (req, res) => {
    try {

        const crops = await Crop.find()
            .populate("farmerId", "name phone");

        console.log("Crops from MongoDB:", crops);

        res.status(200).json({
            message: "Crops fetched successfully",
            crops: crops
        });

    } catch (error) {

        console.log("GET CROPS ERROR:", error);

        res.status(500).json({
            message: "Error getting crops",
            error: error.message
        });
    }
};




// =====================================================
// PLACE ORDER
// =====================================================

const previewFirstOrderDiscount = async (req, res) => {
    try {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({ message: "Request body must be a JSON object" });
        }
        const { customerId, cropId, quantity } = req.body;
        const orderQuantity = parseQuantity(quantity);

        if (!isValidObjectId(customerId) || !isValidObjectId(cropId) || orderQuantity === null) {
            return res.status(400).json({ message: "Valid customer ID, crop ID, and positive quantity are required" });
        }

        const [customer, crop] = await Promise.all([
            Customer.findById(customerId),
            Crop.findById(cropId)
        ]);

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        if (!crop) {
            return res.status(404).json({ message: "Crop not found" });
        }
        if (orderQuantity > Number(crop.quantity)) {
            return res.status(409).json({ message: "Insufficient crop stock" });
        }

        const hasCompletedOrder = Boolean(await Order.exists({
            customerId: customer._id,
            orderStatus: COMPLETED_ORDER_STATUS
        }));
        const pricing = calculateFirstOrderDiscount({
            unitPrice: crop.price,
            quantity: orderQuantity,
            hasCompletedOrder
        });

        return res.status(200).json(pricing);
    } catch (error) {
        console.error("FIRST ORDER DISCOUNT PREVIEW ERROR", error.name);
        return res.status(500).json({ message: "Unable to calculate discount" });
    }
};

const placeOrder = async (req, res) => {
    try {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({ message: "Request body must be a JSON object" });
        }
        const {
            customerId,
            farmerId,
            cropId,
            quantity,
            address,
            paymentMethod
        } = req.body;
        const orderQuantity = parseQuantity(quantity);

        if (
            !isValidObjectId(customerId) ||
            !isValidObjectId(farmerId) ||
            !isValidObjectId(cropId) ||
            orderQuantity === null ||
            typeof address !== "string" ||
            address.trim() === "" ||
            !paymentMethod
        ) {
            return res.status(400).json({ message: "Valid customer, farmer, crop, quantity, address, and payment method are required" });
        }
        if (paymentMethod !== "COD" && paymentMethod !== "UPI") {
            return res.status(400).json({ message: "Invalid payment method" });
        }

        const [customer, farmer, crop] = await Promise.all([
            Customer.findById(customerId),
            Farmer.findById(farmerId),
            Crop.findById(cropId)
        ]);

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        if (!farmer) {
            return res.status(404).json({ message: "Farmer not found" });
        }
        if (!crop) {
            return res.status(404).json({ message: "Crop not found" });
        }
        if (crop.farmerId.toString() !== farmer._id.toString()) {
            return res.status(400).json({ message: "This crop does not belong to this farmer" });
        }

        const hasCompletedOrder = Boolean(await Order.exists({
            customerId: customer._id,
            orderStatus: COMPLETED_ORDER_STATUS
        }));
        const pricing = calculateFirstOrderDiscount({
            unitPrice: crop.price,
            quantity: orderQuantity,
            hasCompletedOrder
        });

        const reservedCrop = await Crop.findOneAndUpdate(
            { _id: crop._id, quantity: { $gte: orderQuantity } },
            { $inc: { quantity: -orderQuantity } },
            { new: true }
        );
        if (!reservedCrop) {
            return res.status(409).json({ message: "Insufficient crop stock" });
        }

        let savedOrder;
        try {
            savedOrder = await Order.create({
                customerId: customer._id,
                customerName: customer.name,
                customerPhone: customer.phone,
                customerEmail: customer.email,
                farmerId: farmer._id,
                cropId: crop._id,
                cropName: crop.cropName,
                quantity: orderQuantity,
                unit: crop.unit,
                price: toCents(crop.price) / 100,
                subtotal: pricing.subtotal,
                discountPercentage: pricing.discountPercentage,
                discountAmount: pricing.discountAmount,
                finalAmount: pricing.finalAmount,
                totalAmount: pricing.finalAmount,
                address: address.trim(),
                paymentMethod,
                paymentStatus: "Pending",
                orderStatus: "Pending"
            });
        } catch (error) {
            try {
                await Crop.updateOne({ _id: crop._id }, { $inc: { quantity: orderQuantity } });
            } catch (rollbackError) {
                console.error("ORDER STOCK ROLLBACK FAILED", rollbackError.name);
            }
            throw error;
        }

        let notification = null;
        let warning;
        try {
            notification = await Notification.create({
                farmerId: farmer._id,
                orderId: savedOrder._id,
                message: `New order received for ${crop.cropName}. Quantity: ${orderQuantity} ${crop.unit}. Total Amount: ₹${pricing.finalAmount}. Payment: ${paymentMethod}. Customer: ${customer.name}. Phone: ${customer.phone}.`,
                isRead: false
            });
        } catch (error) {
            console.error("ORDER NOTIFICATION CREATION FAILED", error.name);
            warning = "Order placed, but the farmer notification could not be created";
        }

        return res.status(201).json({
            message: "Order placed successfully",
            ...(warning ? { warning } : {}),
            order: savedOrder,
            notification,
            remainingQuantity: reservedCrop.quantity
        });
    } catch (error) {
        console.error("PLACE ORDER ERROR", error.name);
        return res.status(500).json({ message: "Error placing order" });
    }
};

const getFarmerNotifications = async (req, res) => {
    try {
        const { farmerId } = req.params;
        if (!isValidObjectId(farmerId)) {
            return res.status(400).json({ message: "Valid farmer ID is required" });
        }

        const notifications = await Notification.find({ farmerId })
            .populate({
                path: "orderId",
                populate: {
                    path: "customerId",
                    select: "name phone email address"
                }
            })
            .sort({ createdAt: -1 });

        return res.status(200).json({
            message: "Farmer notifications fetched successfully",
            notifications
        });
    } catch (error) {
        console.error("GET FARMER NOTIFICATIONS ERROR", error.name);
        return res.status(500).json({ message: "Error getting farmer notifications" });
    }
};

const getCustomerOrders = async (req, res) => {
    try {
        const { customerId } = req.params;
        if (!isValidObjectId(customerId)) {
            return res.status(400).json({ message: "Valid customer ID is required" });
        }

        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const orders = await Order.find({ customerId }).sort({ createdAt: -1 });
        return res.status(200).json({
            message: "Customer orders fetched successfully",
            orders
        });
    } catch (error) {
        console.error("GET CUSTOMER ORDERS ERROR", error.name);
        return res.status(500).json({ message: "Error getting customer orders" });
    }
};

const getFarmerOrders = async (req, res) => {
    try {
        const { farmerId } = req.params;
        if (!isValidObjectId(farmerId)) {
            return res.status(400).json({ message: "Valid farmer ID is required" });
        }

        const orders = await Order.find({ farmerId }).sort({ createdAt: -1 });
        return res.status(200).json({
            message: "Farmer orders fetched successfully",
            orders
        });
    } catch (error) {
        console.error("GET FARMER ORDERS ERROR", error.name);
        return res.status(500).json({ message: "Error getting farmer orders" });
    }
};

const markOrderDelivered = async (req, res) => {
    try {
        const { orderId } = req.params;

        if (!isValidObjectId(orderId)) {
            return res.status(400).json({
                message: "Valid order ID is required"
            });
        }

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        if (order.paymentMethod === "UPI" && order.paymentStatus !== "Paid") {
            return res.status(400).json({
                message: "UPI payment must be verified before delivery"
            });
        }

        order.orderStatus = COMPLETED_ORDER_STATUS;
        await order.save();

        return res.status(200).json({
            message: "Order marked as Delivered",
            order: order
        });

    } catch (error) {
        console.error("MARK DELIVERED ERROR", error.name);
        return res.status(500).json({
            message: "Error updating order"
        });
    }
};
// =====================================
// SEND OTP
// =====================================
// =====================================================
// SEND OTP BEFORE ACCOUNT CREATION
// =====================================================

const sendOTP = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            address,
            farmLocation,
            userType
        } = req.body;

        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (
            !name ||
            !email ||
            !phone ||
            !password ||
            !address ||
            !userType
        ) {
            return res.status(400).json({
                message: "All required fields must be filled"
            });
        }

        if (userType === "farmer" && !farmLocation) {
            return res.status(400).json({
                message: "Farm location is required"
            });
        }

        if (
            userType !== "customer" &&
            userType !== "farmer"
        ) {
            return res.status(400).json({
                message: "Invalid user type"
            });
        }

        // ---------------------------------------------
        // CHECK WHETHER EMAIL ALREADY EXISTS
        // ---------------------------------------------

        const existingCustomer = await Customer.findOne({
            email
        });

        const existingFarmer = await Farmer.findOne({
            email
        });

        if (existingCustomer || existingFarmer) {
            return res.status(400).json({
                message: "Email is already registered"
            });
        }

        // ---------------------------------------------
        // GENERATE 6 DIGIT OTP
        // ---------------------------------------------

        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        // OTP valid for 5 minutes
        const otpExpires = new Date(
            Date.now() + 5 * 60 * 1000
        );



        // ---------------------------------------------
        // SAVE TEMPORARY REGISTRATION DATA
        // ---------------------------------------------

        await PendingVerification.findOneAndUpdate(
            {
                email,
                userType
            },
            {
                name,
                email,
                phone,
                password: password,
                address,
                farmLocation:
                    userType === "farmer"
                        ? farmLocation
                        : "",
                userType,
                otp,
                otpExpires
            },
            {
                upsert: true,
                new: true
            }
        );

        // ---------------------------------------------
        // SEND OTP EMAIL
        // ---------------------------------------------

        await sendOTPEmail(email, otp);

        return res.status(200).json({
            message: "OTP sent successfully",
            email,
            userType
        });

    } catch (error) {

        console.error(
            "SEND OTP ERROR:",
            error
        );

        return res.status(500).json({
            message: "Failed to send OTP",
            error: error.message
        });
    }
};
// =====================================================
// VERIFY OTP AND CREATE ACCOUNT
// =====================================================

const verifyOTP = async (req, res) => {
    try {
        const {
            email,
            otp,
            userType
        } = req.body;

        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (!email || !otp || !userType) {
            return res.status(400).json({
                message:
                    "Email, OTP and user type are required"
            });
        }

        // ---------------------------------------------
        // FIND TEMPORARY REGISTRATION
        // ---------------------------------------------

        const pendingUser =
            await PendingVerification.findOne({
                email,
                userType
            });

        if (!pendingUser) {
            return res.status(404).json({
                message:
                    "No pending verification found. Please signup again."
            });
        }

        // ---------------------------------------------
        // CHECK OTP
        // ---------------------------------------------

        if (pendingUser.otp !== otp) {
            return res.status(400).json({
                message: "Invalid OTP"
            });
        }

        // ---------------------------------------------
        // CHECK OTP EXPIRY
        // ---------------------------------------------

        if (
            !pendingUser.otpExpires ||
            new Date() > new Date(pendingUser.otpExpires)
        ) {
            return res.status(400).json({
                message:
                    "OTP has expired. Please request a new OTP."
            });
        }

        // ---------------------------------------------
        // CHECK EMAIL AGAIN
        // ---------------------------------------------

        const existingCustomer =
            await Customer.findOne({
                email
            });

        const existingFarmer =
            await Farmer.findOne({
                email
            });

        if (existingCustomer || existingFarmer) {

            await PendingVerification.deleteOne({
                _id: pendingUser._id
            });

            return res.status(400).json({
                message:
                    "Email is already registered"
            });
        }

        // ---------------------------------------------
        // CREATE CUSTOMER
        // ---------------------------------------------

        let newUser;

        if (userType === "customer") {

            newUser = new Customer({
                name: pendingUser.name,
                email: pendingUser.email,
                phone: pendingUser.phone,
                password: pendingUser.password,
                address: pendingUser.address,

                // Account is verified immediately
                // because OTP was successfully verified
                isVerified: true,

                otp: null,
                otpExpires: null
            });

            await newUser.save();
        }

        // ---------------------------------------------
        // CREATE FARMER
        // ---------------------------------------------

        else if (userType === "farmer") {

            newUser = new Farmer({
                name: pendingUser.name,
                email: pendingUser.email,
                phone: pendingUser.phone,
                password: pendingUser.password,
                address: pendingUser.address,
                farmLocation: pendingUser.farmLocation,

                // Account is verified immediately
                isVerified: true,

                otp: null,
                otpExpires: null
            });

            await newUser.save();
        }

        // ---------------------------------------------
        // DELETE TEMPORARY DATA
        // ---------------------------------------------

        await PendingVerification.deleteOne({
            _id: pendingUser._id
        });

        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------

        return res.status(201).json({
            message:
                "Email verified and account created successfully",
            userId: newUser._id,
            userType
        });

    } catch (error) {

        console.error(
            "VERIFY OTP ERROR:",
            error
        );

        return res.status(500).json({
            message:
                "OTP verification failed",
            error: error.message
        });
    }
};
// =====================================================
// FORGOT PASSWORD - SEND OTP
// =====================================================

const forgotPassword = async (req, res) => {
    try {

        const { email, userType } = req.body;

        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (!email || !userType) {
            return res.status(400).json({
                message: "Email and user type are required"
            });
        }

        if (
            userType !== "customer" &&
            userType !== "farmer"
        ) {
            return res.status(400).json({
                message: "Invalid user type"
            });
        }

        // ---------------------------------------------
        // FIND USER
        // ---------------------------------------------

        let user;

        if (userType === "customer") {

            user = await Customer.findOne({ email });

        } else {

            user = await Farmer.findOne({ email });

        }

        // ---------------------------------------------
        // CHECK USER
        // ---------------------------------------------

        if (!user) {
            return res.status(404).json({
                message: "No account found with this email"
            });
        }

        // ---------------------------------------------
        // GENERATE OTP
        // ---------------------------------------------

        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        // OTP valid for 5 minutes

        const otpExpires = new Date(
            Date.now() + 5 * 60 * 1000
        );

        // ---------------------------------------------
        // SAVE OTP
        // ---------------------------------------------

        user.otp = otp;
        user.otpExpires = otpExpires;

        await user.save();

        // ---------------------------------------------
        // SEND EMAIL
        // ---------------------------------------------

        await sendOTPEmail(email, otp);

        // ---------------------------------------------
        // RESPONSE
        // ---------------------------------------------

        return res.status(200).json({

            message: "Password reset OTP sent successfully",

            email: email,

            userType: userType

        });

    } catch (error) {

        console.error(
            "FORGOT PASSWORD ERROR:",
            error
        );

        return res.status(500).json({

            message: "Failed to send password reset OTP",

            error: error.message

        });

    }
};


// =====================================================
// VERIFY FORGOT PASSWORD OTP
// =====================================================

const verifyForgotPasswordOTP = async (req, res) => {

    try {

        const {
            email,
            otp,
            userType
        } = req.body;


        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (!email || !otp || !userType) {

            return res.status(400).json({

                message:
                    "Email, OTP and user type are required"

            });

        }


        // ---------------------------------------------
        // FIND USER
        // ---------------------------------------------

        let user;

        if (userType === "customer") {

            user = await Customer.findOne({
                email
            });

        } else if (userType === "farmer") {

            user = await Farmer.findOne({
                email
            });

        } else {

            return res.status(400).json({

                message: "Invalid user type"

            });

        }


        // ---------------------------------------------
        // CHECK USER
        // ---------------------------------------------

        if (!user) {

            return res.status(404).json({

                message:
                    "No account found with this email"

            });

        }


        // ---------------------------------------------
        // CHECK OTP
        // ---------------------------------------------

        if (user.otp !== otp) {

            return res.status(400).json({

                message: "Invalid OTP"

            });

        }


        // ---------------------------------------------
        // CHECK OTP EXPIRY
        // ---------------------------------------------

        if (
            !user.otpExpires ||
            new Date() > new Date(user.otpExpires)
        ) {

            return res.status(400).json({

                message:
                    "OTP has expired. Please request a new OTP."

            });

        }


        // ---------------------------------------------
        // OTP VERIFIED
        // ---------------------------------------------

        return res.status(200).json({

            message:
                "OTP verified successfully"

        });

    } catch (error) {

        console.error(
            "VERIFY FORGOT PASSWORD OTP ERROR:",
            error
        );

        return res.status(500).json({

            message:
                "OTP verification failed",

            error: error.message

        });

    }

};


// =====================================================
// RESET PASSWORD
// =====================================================

const resetPassword = async (req, res) => {

    try {

        const {
            email,
            otp,
            userType,
            newPassword
        } = req.body;


        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (
            !email ||
            !otp ||
            !userType ||
            !newPassword
        ) {

            return res.status(400).json({

                message:
                    "All fields are required"

            });

        }


        // ---------------------------------------------
        // PASSWORD LENGTH
        // ---------------------------------------------

        if (newPassword.length < 6) {

            return res.status(400).json({

                message:
                    "Password must be at least 6 characters"

            });

        }


        // ---------------------------------------------
        // FIND USER
        // ---------------------------------------------

        let user;

        if (userType === "customer") {

            user = await Customer.findOne({
                email
            });

        } else if (userType === "farmer") {

            user = await Farmer.findOne({
                email
            });

        } else {

            return res.status(400).json({

                message: "Invalid user type"

            });

        }


        // ---------------------------------------------
        // CHECK USER
        // ---------------------------------------------

        if (!user) {

            return res.status(404).json({

                message:
                    "No account found with this email"

            });

        }


        // ---------------------------------------------
        // CHECK OTP AGAIN
        // ---------------------------------------------

        if (user.otp !== otp) {

            return res.status(400).json({

                message: "Invalid OTP"

            });

        }


        // ---------------------------------------------
        // CHECK OTP EXPIRY
        // ---------------------------------------------

        if (
            !user.otpExpires ||
            new Date() > new Date(user.otpExpires)
        ) {

            return res.status(400).json({

                message:
                    "OTP has expired. Please request a new OTP."

            });

        }


        // ---------------------------------------------
        // UPDATE PASSWORD
        // ---------------------------------------------

        user.password = newPassword;

        // Clear OTP after successful password reset

        user.otp = null;
        user.otpExpires = null;

        await user.save();


        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------

        return res.status(200).json({

            message:
                "Password reset successfully"

        });

    } catch (error) {

        console.error(
            "RESET PASSWORD ERROR:",
            error
        );

        return res.status(500).json({

            message:
                "Failed to reset password",

            error: error.message

        });

    }

};
module.exports = {

    registerFarmer, registerCustomer, addCrop,
    getFarmerCrops, getCrops, placeOrder, previewFirstOrderDiscount,
    getFarmerNotifications, getCustomerOrders, getFarmerOrders,
    markOrderDelivered, verifyOTP, sendOTP,
    forgotPassword, verifyForgotPasswordOTP, resetPassword

};
