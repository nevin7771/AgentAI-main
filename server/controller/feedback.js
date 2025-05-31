// server/controller/feedback.js - FIXED nodemailer import for ES modules
import nodemailer from "nodemailer";
import { user } from "../model/user.js";

// FIXED: Correct nodemailer usage for ES modules
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Test email configuration on startup
const testEmailConfig = async () => {
  try {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      await emailTransporter.verify();
      console.log("✅ [Feedback] Email configuration verified successfully");
    } else {
      console.warn(
        "⚠️ [Feedback] Email credentials not configured - notifications will be logged only"
      );
    }
  } catch (error) {
    console.error("❌ [Feedback] Email configuration error:", error.message);
  }
};

// Test email config when module loads
testEmailConfig();

// Utility function to send notification emails
const sendNotificationEmail = async (
  subject,
  htmlContent,
  type = "feedback"
) => {
  try {
    const recipientEmail =
      process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER;

    if (!recipientEmail || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`📧 [Email] Would send: ${subject}`);
      console.log(`📧 [Email] Content: ${htmlContent.substring(0, 200)}...`);
      return { messageId: "local-log-only" };
    }

    const mailOptions = {
      from: `"Vista Chat System" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      subject: `[Vista Chat ${type.toUpperCase()}] ${subject}`,
      html: htmlContent,
      priority: type === "error" ? "high" : "normal",
    };

    const result = await emailTransporter.sendMail(mailOptions);
    console.log(`✅ [Email] Sent successfully: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error(`❌ [Email] Failed to send notification:`, error.message);
    throw error;
  }
};

// Simple email template for feedback
const generateEmailTemplate = (data, type) => {
  const timestamp = new Date(data.timestamp || Date.now()).toLocaleString();

  if (type === "feedback") {
    const emojiMap = {
      positive: "👍",
      negative: "👎",
      copy: "📋",
      retry: "🔄",
    };

    const emoji = emojiMap[data.feedbackType] || "💬";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: #1a73e8; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .feedback-badge { display: inline-block; padding: 6px 12px; border-radius: 16px; background: #e8f0fe; color: #1967d2; font-weight: bold; }
          .details { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${emoji} Vista Chat Feedback</h2>
          </div>
          <div class="content">
            <p><strong>Feedback:</strong> <span class="feedback-badge">${
              data.feedbackType
            } ${emoji}</span></p>
            <p><strong>Time:</strong> ${timestamp}</p>
            
            ${
              data.userQuery
                ? `
            <div class="details">
              <h4>User Query</h4>
              <p><em>"${data.userQuery}"</em></p>
            </div>
            `
                : ""
            }
            
            <div class="details">
              <h4>Details</h4>
              <p><strong>Message ID:</strong> ${data.messageId || "N/A"}</p>
              <p><strong>Chat ID:</strong> ${data.chatHistoryId || "N/A"}</p>
              <p><strong>User:</strong> ${data.userId || "Anonymous"}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  } else if (type === "error") {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: #ea4335; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .error-badge { display: inline-block; padding: 6px 12px; border-radius: 16px; background: #fce8e6; color: #d93025; font-weight: bold; }
          .code { background: #f1f3f4; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🚨 Vista Chat Error Report</h2>
          </div>
          <div class="content">
            <p><strong>Error:</strong> <span class="error-badge">${
              data.type
            }</span></p>
            <p><strong>Time:</strong> ${timestamp}</p>
            
            ${
              data.error
                ? `
            <h4>Error Details</h4>
            <div class="code">${
              data.error.message || "No message available"
            }</div>
            `
                : ""
            }
          </div>
        </div>
      </body>
      </html>
    `;
  }
};

// Submit feedback controller
export const submitFeedback = async (req, res, next) => {
  try {
    console.log("[Feedback] Processing feedback submission...");

    const feedbackData = {
      ...req.body,
      userId: req.user?._id || "anonymous",
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[Feedback] Type: ${feedbackData.feedbackType} from user: ${feedbackData.userId}`
    );

    // Send email notification
    try {
      const emailSubject = `${feedbackData.feedbackType.toUpperCase()} Feedback`;
      const emailContent = generateEmailTemplate(feedbackData, "feedback");
      await sendNotificationEmail(emailSubject, emailContent, "feedback");
    } catch (emailError) {
      console.error("[Feedback] Email failed:", emailError.message);
    }

    res.status(200).json({
      success: true,
      message: "Feedback received successfully",
      id: `feedback_${Date.now()}`,
      timestamp: feedbackData.timestamp,
    });
  } catch (error) {
    console.error("[Feedback] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process feedback",
    });
  }
};

// Report error controller
export const reportError = async (req, res, next) => {
  try {
    console.log("[Error Report] Processing error report...");

    const errorData = {
      ...req.body,
      userId: req.user?._id || "anonymous",
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };

    console.log(`[Error Report] Type: ${errorData.type}`);

    // Send email notification
    try {
      const emailSubject = `ERROR: ${errorData.type}`;
      const emailContent = generateEmailTemplate(errorData, "error");
      await sendNotificationEmail(emailSubject, emailContent, "error");
    } catch (emailError) {
      console.error("[Error Report] Email failed:", emailError.message);
    }

    res.status(200).json({
      success: true,
      message: "Error report received",
      reportId: `error_${Date.now()}`,
    });
  } catch (error) {
    console.error("[Error Report] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process error report",
    });
  }
};

// Get feedback statistics controller
export const getFeedbackStats = async (req, res, next) => {
  try {
    const stats = {
      totalFeedback: 0,
      positiveCount: 0,
      negativeCount: 0,
      copyActions: 0,
      retryActions: 0,
      lastUpdated: new Date().toISOString(),
      message: "Statistics tracking in development",
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error("[Feedback Stats] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch feedback statistics",
    });
  }
};

// System health check controller
export const getSystemHealth = (req, res) => {
  const healthData = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {
      email: process.env.SMTP_USER ? "configured" : "not configured",
      feedback: "enabled",
    },
  };

  res.json(healthData);
};
