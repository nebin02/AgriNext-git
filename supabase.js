const { createClient } = require("@supabase/supabase-js");

let supabase;

const getSupabase = () => {
    const requiredVariables = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"];
    const missingVariables = requiredVariables.filter((name) => !process.env[name]);

    if (missingVariables.length) {
        const error = new Error(
            `Missing required server environment variables: ${missingVariables.join(", ")}`
        );
        error.name = "MissingStorageConfigurationError";
        throw error;
    }

    if (!supabase) {
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SECRET_KEY
        );
    }

    return supabase;
};

module.exports = getSupabase;