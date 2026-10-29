
const Farmer = require("./farmerschema");
const Customer = require("./customerschema");
const Crop = require("./cropschema");
const sendOTPEmail = require("./emailService");
const PendingVerification = require("./pendingverificationschema");
const Order = require("./orderschema");
const Notification = require("./notificationschema");
const getSupabase = require("./supabase");
const crypto = require("node:crypto");
const { createOtp, hashOtp, verifyOtp } = require("./otpUtils");
const { EmailDeliveryError } = sendOTPEmail;
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

const registerFarmer = (req, res, next) => {
    req.registrationRoute = true;
    return sendOTP({
        ...req,
        body: { ...(req.body || {}), userType: "farmer" }
    }, res, next);
};
// ===============================
// CUSTOMER REGISTER
// ===============================

const registerCustomer = (req, res, next) => {
    req.registrationRoute = true;
    return sendOTP({
        ...req,
        body: { ...(req.body || {}), userType: "customer" }
    }, res, next);
};

// ===============================
// ADD CROP
// ===============================

const addCrop = async (req, res) => {
    let uploadedPath;

    try {
        if (!req.file) {
            return res.status(400).json({ message: "Crop image is required" });
        }

        const {
            farmerId,
            cropName,
            quantity,
            unit,
            price,
            location
        } = req.body;


        const extensionByType = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp"
        };
        const bucket = process.env.SUPABASE_STORAGE_BUCKET;
        if (!bucket) {
            return res.status(503).json({ message: "Image storage is not configured" });
        }

        const supabase = getSupabase();
        const objectName = `crops/${farmerId}/${crypto.randomUUID()}.${extensionByType[req.file.mimetype]}`;
        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(objectName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (uploadError) {
            console.error("Supabase image upload failed:", uploadError.name || "StorageError");
            return res.status(502).json({ message: "Unable to upload crop image" });
        }

        uploadedPath = objectName;
        const { data: imageData } = supabase.storage
            .from(bucket)
            .getPublicUrl(objectName);

        const newCrop = new Crop({
            farmerId,
            cropName,
            quantity,
            unit,
            price,
            location,
            imageUrl: imageData.publicUrl
        });

        await newCrop.save();

        return res.status(201).json({
            message: "Crop added successfully",
            crop: newCrop
        });

    } catch (error) {
        if (uploadedPath) {
            try {
                const { error: cleanupError } = await getSupabase().storage
                    .from(process.env.SUPABASE_STORAGE_BUCKET)
                    .remove([uploadedPath]);
                if (cleanupError) {
                    console.error("Failed to clean up uploaded crop image:", cleanupError.name || "StorageError");
                }
            } catch (cleanupError) {
                console.error("Failed to clean up uploaded crop image:", cleanupError.name);
            }
        }

        console.error("Crop creation failed:", error.name, error.code || "");
        if (error.name === "MissingStorageConfigurationError") {
            return res.status(503).json({ message: "Image storage is not configured" });
        }
        return res.status(500).json({
            message: "Error adding crop"
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
    let pendingVerification;
    let otpHash;

    try {
        const {
            name,
            email,
            phone,
            password,
            address,
            farmLocation,
            userType
        } = req.body || {};

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

        if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ message: "Enter a valid email address" });
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

        const normalizedEmail = email.trim().toLowerCase();
        const existingCustomer = await Customer.findOne({
            email: normalizedEmail
        });

        const existingFarmer = await Farmer.findOne({
            email: normalizedEmail
        });

        if (existingCustomer || existingFarmer) {
            return res.status(400).json({
                message: "Email is already registered"
            });
        }

        // ---------------------------------------------
        // GENERATE 6 DIGIT OTP
        // ---------------------------------------------

        const existingPending = await PendingVerification.findOne({
            email: normalizedEmail,
            userType
        });
        const now = new Date();
        const resendDelayMs = 60 * 1000;
        if (
            existingPending?.lastOtpSentAt &&
            now.getTime() - existingPending.lastOtpSentAt.getTime() < resendDelayMs
        ) {
            const retryAfterSeconds = Math.ceil(
                (resendDelayMs - (now.getTime() - existingPending.lastOtpSentAt.getTime())) / 1000
            );
            return res.status(429).json({
                message: "Please wait before requesting another verification code",
                retryAfterSeconds
            });
        }

        const otp = createOtp();
        otpHash = hashOtp(otp);

        // OTP valid for 5 minutes
        const otpExpires = new Date(
            now.getTime() + 5 * 60 * 1000
        );



        // ---------------------------------------------
        // SAVE TEMPORARY REGISTRATION DATA
        // ---------------------------------------------

        pendingVerification = await PendingVerification.findOneAndUpdate(
            {
                email: normalizedEmail,
                userType
            },
            {
                name,
                email: normalizedEmail,
                phone,
                password: password,
                address,
                farmLocation:
                    userType === "farmer"
                        ? farmLocation
                        : "",
                userType,
                otp: otpHash,
                otpExpires,
                otpAttempts: 0,
                lastOtpSentAt: now
            },
            {
                upsert: true,
                new: true
            }
        );

        // ---------------------------------------------
        // SEND OTP EMAIL
        // ---------------------------------------------

        await sendOTPEmail(normalizedEmail, otp);

        return res.status(req.registrationRoute ? 201 : 200).json({
            message: req.registrationRoute
                ? "Registration successful. OTP sent to your email."
                : "OTP sent successfully",
            email: normalizedEmail,
            userType
        });

    } catch (error) {
        if (error instanceof EmailDeliveryError) {
            console.error("SEND OTP ERROR:", error.code, error.message);
            if (pendingVerification && otpHash) {
                try {
                    await PendingVerification.deleteOne({
                        _id: pendingVerification._id,
                        otp: otpHash
                    });
                } catch (cleanupError) {
                    console.error(
                        "Pending OTP cleanup failed:",
                        cleanupError.name,
                        cleanupError.code || ""
                    );
                }
            }
            return res.status(error.statusCode).json({ message: error.publicMessage });
        }

        console.error("SEND OTP ERROR:", error.name, error.code || "");
        return res.status(500).json({ message: "Unable to process registration right now" });
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
        } = req.body || {};

        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (
            typeof email !== "string" ||
            typeof otp !== "string" ||
            !/^\d{6}$/.test(otp) ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
            !["customer", "farmer"].includes(userType)
        ) {
            return res.status(400).json({
                message:
                    "A valid email, six-digit OTP and user type are required"
            });
        }

        // ---------------------------------------------
        // FIND TEMPORARY REGISTRATION
        // ---------------------------------------------

        const pendingUser =
            await PendingVerification.findOne({
                email: email.trim().toLowerCase(),
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

        if (
            !pendingUser.otpExpires ||
            Date.now() >= new Date(pendingUser.otpExpires).getTime()
        ) {
            return res.status(400).json({
                message:
                    "OTP has expired. Please request a new OTP."
            });
        }

        if (pendingUser.otpAttempts >= 5) {
            return res.status(429).json({
                message: "Too many incorrect verification attempts. Request a new code."
            });
        }

        if (!verifyOtp(otp, pendingUser.otp)) {
            const updatedPending = await PendingVerification.findOneAndUpdate(
                {
                    _id: pendingUser._id,
                    $or: [
                        { otpAttempts: { $lt: 5 } },
                        { otpAttempts: { $exists: false } }
                    ]
                },
                { $inc: { otpAttempts: 1 } },
                { new: true }
            );
            if (!updatedPending || updatedPending.otpAttempts >= 5) {
                return res.status(429).json({
                    message: "Too many incorrect verification attempts. Request a new code."
                });
            }
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // ---------------------------------------------
        // CHECK EMAIL AGAIN
        // ---------------------------------------------

        const existingCustomer =
            await Customer.findOne({
                email: pendingUser.email
            });

        const existingFarmer =
            await Farmer.findOne({
                email: pendingUser.email
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
        } else {
            return res.status(400).json({ message: "Invalid user type" });
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
        if (error.code === 11000) {
            return res.status(409).json({ message: "Email is already registered" });
        }
        console.error("VERIFY OTP ERROR:", error.name, error.code || "");
        return res.status(500).json({ message: "OTP verification failed" });
    }
};
// =====================================================
// FORGOT PASSWORD - SEND OTP
// =====================================================

const forgotPassword = async (req, res) => {
    let user;

    try {

        const { email, userType } = req.body || {};

        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (
            typeof email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
            !userType
        ) {
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

        if (userType === "customer") {

            user = await Customer.findOne({ email: email.trim().toLowerCase() });

        } else {

            user = await Farmer.findOne({ email: email.trim().toLowerCase() });

        }

        // ---------------------------------------------
        // CHECK USER
        // ---------------------------------------------

        const normalizedEmail = email.trim().toLowerCase();
        if (!user) {
            return res.status(200).json({
                message: "If an account exists for this email, a password reset code will be sent",
                email: normalizedEmail,
                userType
            });
        }

        const now = new Date();
        const resendDelayMs = 60 * 1000;
        if (
            user.lastOtpSentAt &&
            now.getTime() - user.lastOtpSentAt.getTime() < resendDelayMs
        ) {
            return res.status(200).json({
                message: "If an account exists for this email, a password reset code will be sent",
                email: normalizedEmail,
                userType
            });
        }

        // ---------------------------------------------
        // GENERATE OTP
        // ---------------------------------------------

        const otp = createOtp();

        // OTP valid for 5 minutes

        const otpExpires = new Date(now.getTime() + 5 * 60 * 1000);

        // ---------------------------------------------
        // SAVE OTP
        // ---------------------------------------------

        user.otp = hashOtp(otp);
        user.otpExpires = otpExpires;
        user.otpAttempts = 0;
        user.lastOtpSentAt = now;

        await user.save();

        // ---------------------------------------------
        // SEND EMAIL
        // ---------------------------------------------

        await sendOTPEmail(normalizedEmail, otp);

        // ---------------------------------------------
        // RESPONSE
        // ---------------------------------------------

        return res.status(200).json({
            message: "If an account exists for this email, a password reset code will be sent",
            email: normalizedEmail,
            userType
        });

    } catch (error) {
        if (error instanceof EmailDeliveryError) {
            console.error("FORGOT PASSWORD EMAIL ERROR:", error.code, error.message);
            if (user) {
                user.otp = null;
                user.otpExpires = null;
                user.otpAttempts = 0;
                user.lastOtpSentAt = null;
                try {
                    await user.save();
                } catch (cleanupError) {
                    console.error(
                        "Password reset OTP cleanup failed:",
                        cleanupError.name,
                        cleanupError.code || ""
                    );
                }
            }
            return res.status(error.statusCode).json({ message: error.publicMessage });
        }

        console.error("FORGOT PASSWORD ERROR:", error.name, error.code || "");
        return res.status(500).json({ message: "Failed to send password reset OTP" });

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
        } = req.body || {};


        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (
            typeof email !== "string" ||
            typeof otp !== "string" ||
            !/^\d{6}$/.test(otp) ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
            !userType
        ) {

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
                email: email.trim().toLowerCase()
            });

        } else if (userType === "farmer") {

            user = await Farmer.findOne({
                email: email.trim().toLowerCase()
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
            return res.status(400).json({ message: "Invalid or expired OTP" });

        }


        // ---------------------------------------------
        // CHECK OTP
        // ---------------------------------------------

        if (!user.otpExpires || Date.now() >= new Date(user.otpExpires).getTime()) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        if ((user.otpAttempts || 0) >= 5) {
            return res.status(429).json({
                message: "Too many incorrect verification attempts. Request a new code."
            });
        }

        if (!verifyOtp(otp, user.otp)) {
            user.otpAttempts = (user.otpAttempts || 0) + 1;
            await user.save();
            return res.status(user.otpAttempts >= 5 ? 429 : 400).json({
                message: user.otpAttempts >= 5
                    ? "Too many incorrect verification attempts. Request a new code."
                    : "Invalid OTP"
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

        console.error("VERIFY FORGOT PASSWORD OTP ERROR:", error.name, error.code || "");
        return res.status(500).json({ message: "OTP verification failed" });

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
        } = req.body || {};


        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (
            !email ||
            typeof otp !== "string" ||
            !/^\d{6}$/.test(otp) ||
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
                email: email.trim().toLowerCase()
            });

        } else if (userType === "farmer") {

            user = await Farmer.findOne({
                email: email.trim().toLowerCase()
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
            return res.status(400).json({ message: "Invalid or expired OTP" });

        }


        // ---------------------------------------------
        // CHECK OTP AGAIN
        // ---------------------------------------------

        if (!user.otpExpires || Date.now() >= new Date(user.otpExpires).getTime()) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        if ((user.otpAttempts || 0) >= 5) {
            return res.status(429).json({
                message: "Too many incorrect verification attempts. Request a new code."
            });
        }

        if (!verifyOtp(otp, user.otp)) {
            user.otpAttempts = (user.otpAttempts || 0) + 1;
            await user.save();
            return res.status(user.otpAttempts >= 5 ? 429 : 400).json({
                message: user.otpAttempts >= 5
                    ? "Too many incorrect verification attempts. Request a new code."
                    : "Invalid OTP"
            });
        }


        // ---------------------------------------------
        // UPDATE PASSWORD
        // ---------------------------------------------

        user.password = newPassword;

        // Clear OTP after successful password reset

        user.otp = null;
        user.otpExpires = null;
        user.otpAttempts = 0;
        user.lastOtpSentAt = null;

        await user.save();


        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------

        return res.status(200).json({

            message:
                "Password reset successfully"

        });

    } catch (error) {

        console.error("RESET PASSWORD ERROR:", error.name, error.code || "");
        return res.status(500).json({ message: "Failed to reset password" });

    }

};
module.exports = {

    registerFarmer, registerCustomer, addCrop,
    getFarmerCrops, getCrops, placeOrder, previewFirstOrderDiscount,
    getFarmerNotifications, getCustomerOrders, getFarmerOrders,
    markOrderDelivered, verifyOTP, sendOTP,
    forgotPassword, verifyForgotPasswordOTP, resetPassword

};
