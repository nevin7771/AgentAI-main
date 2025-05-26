// server/utils/databaseCleanup.js - Database cleanup utility
import { user } from "../model/user.js";
import { chat } from "../model/chat.js";
import { chatHistory } from "../model/chatHistory.js";

/**
 * Comprehensive database cleanup and consistency check
 */
export const cleanupDatabase = async () => {
  console.log("🧹 Starting comprehensive database cleanup...");

  const results = {
    users: { processed: 0, fixed: 0, errors: 0 },
    chatHistories: { orphaned: 0, removed: 0, fixed: 0 },
    chats: { orphaned: 0, removed: 0 },
    totalTime: 0,
  };

  const startTime = Date.now();

  try {
    // Step 1: Fix all users' chat history references
    console.log("📋 Step 1: Fixing user chat history references...");
    await fixAllUsersChats(results);

    // Step 2: Remove orphaned chat histories (no user reference)
    console.log("🗑️ Step 2: Cleaning up orphaned chat histories...");
    await cleanupOrphanedChatHistories(results);

    // Step 3: Remove orphaned chats (no chat history reference)
    console.log("🗑️ Step 3: Cleaning up orphaned chats...");
    await cleanupOrphanedChats(results);

    // Step 4: Ensure all chat histories have corresponding chat documents
    console.log(
      "🔗 Step 4: Ensuring chat history and chat document consistency..."
    );
    await ensureChatDocumentConsistency(results);

    results.totalTime = Date.now() - startTime;

    console.log("✅ Database cleanup completed!");
    console.log("📊 Results:", JSON.stringify(results, null, 2));

    return results;
  } catch (error) {
    console.error("💥 Error during database cleanup:", error);
    results.totalTime = Date.now() - startTime;
    results.error = error.message;
    return results;
  }
};

/**
 * Fix chat history references for all users
 */
const fixAllUsersChats = async (results) => {
  try {
    const users = await user.find({});

    for (const userData of users) {
      results.users.processed++;

      try {
        const originalCount = userData.chatHistory.length;
        const validChatHistoryIds = [];

        // Check each chat history reference
        for (const chatHistoryId of userData.chatHistory) {
          const chatHistoryDoc = await chatHistory.findOne({
            _id: chatHistoryId,
            user: userData._id,
          });

          if (chatHistoryDoc) {
            validChatHistoryIds.push(chatHistoryId);
          } else {
            console.log(
              `🔧 User ${userData._id}: Removing invalid chat reference ${chatHistoryId}`
            );
          }
        }

        // Add any orphaned chat histories that belong to this user
        const allUserChats = await chatHistory.find({ user: userData._id });

        for (const chatHistoryDoc of allUserChats) {
          if (
            !validChatHistoryIds.some(
              (id) => id.toString() === chatHistoryDoc._id.toString()
            )
          ) {
            console.log(
              `🔧 User ${userData._id}: Adding orphaned chat ${chatHistoryDoc._id}`
            );
            validChatHistoryIds.push(chatHistoryDoc._id);
          }
        }

        // Enforce 15 chat limit (keep most recent)
        if (validChatHistoryIds.length > 15) {
          const sortedChats = await chatHistory
            .find({
              _id: { $in: validChatHistoryIds },
              user: userData._id,
            })
            .sort({ timestamp: -1 });

          const chatsToKeep = sortedChats.slice(0, 15);
          const chatsToRemove = sortedChats.slice(15);

          console.log(
            `🔧 User ${userData._id}: Enforcing 15 chat limit, removing ${chatsToRemove.length} old chats`
          );

          // Remove old chats
          for (const oldChat of chatsToRemove) {
            await chat.deleteOne({ chatHistory: oldChat._id });
            await chatHistory.deleteOne({ _id: oldChat._id });
          }

          validChatHistoryIds.splice(
            0,
            validChatHistoryIds.length,
            ...chatsToKeep.map((c) => c._id)
          );
        }

        // Update user if changes were made
        if (originalCount !== validChatHistoryIds.length) {
          userData.chatHistory = validChatHistoryIds;
          await userData.save();
          results.users.fixed++;
          console.log(
            `✅ User ${userData._id}: Fixed ${originalCount} -> ${validChatHistoryIds.length} chats`
          );
        }
      } catch (userError) {
        console.error(`❌ Error fixing user ${userData._id}:`, userError);
        results.users.errors++;
      }
    }
  } catch (error) {
    console.error("Error in fixAllUsersChats:", error);
    throw error;
  }
};

/**
 * Remove orphaned chat histories (no user reference)
 */
const cleanupOrphanedChatHistories = async (results) => {
  try {
    const orphanedChatHistories = await chatHistory.find({
      $or: [{ user: null }, { user: { $exists: false } }],
    });

    results.chatHistories.orphaned = orphanedChatHistories.length;

    for (const orphanedHistory of orphanedChatHistories) {
      try {
        // Delete associated chat messages
        await chat.deleteOne({ chatHistory: orphanedHistory._id });
        // Delete the orphaned chat history
        await chatHistory.deleteOne({ _id: orphanedHistory._id });
        results.chatHistories.removed++;
        console.log(`🗑️ Removed orphaned chat history: ${orphanedHistory._id}`);
      } catch (cleanupError) {
        console.error(
          `❌ Error cleaning up chat history ${orphanedHistory._id}:`,
          cleanupError
        );
      }
    }
  } catch (error) {
    console.error("Error in cleanupOrphanedChatHistories:", error);
    throw error;
  }
};

/**
 * Remove orphaned chats (no chatHistory reference)
 */
const cleanupOrphanedChats = async (results) => {
  try {
    const orphanedChats = await chat.find({
      $or: [{ chatHistory: null }, { chatHistory: { $exists: false } }],
    });

    results.chats.orphaned = orphanedChats.length;

    for (const orphanedChat of orphanedChats) {
      try {
        await chat.deleteOne({ _id: orphanedChat._id });
        results.chats.removed++;
        console.log(`🗑️ Removed orphaned chat: ${orphanedChat._id}`);
      } catch (cleanupError) {
        console.error(
          `❌ Error cleaning up chat ${orphanedChat._id}:`,
          cleanupError
        );
      }
    }
  } catch (error) {
    console.error("Error in cleanupOrphanedChats:", error);
    throw error;
  }
};

/**
 * Ensure all chat histories have corresponding chat documents
 */
const ensureChatDocumentConsistency = async (results) => {
  try {
    const allChatHistories = await chatHistory.find({});

    for (const chatHistoryDoc of allChatHistories) {
      const chatDoc = await chat.findOne({ chatHistory: chatHistoryDoc._id });

      if (!chatDoc) {
        console.log(
          `🔧 Creating missing chat document for chat history: ${chatHistoryDoc._id}`
        );

        // Create empty chat document
        const newChatDoc = new chat({
          chatHistory: chatHistoryDoc._id,
          messages: [],
        });

        await newChatDoc.save();

        // Update chat history reference
        if (
          !chatHistoryDoc.chat ||
          chatHistoryDoc.chat.toString() !== newChatDoc._id.toString()
        ) {
          chatHistoryDoc.chat = newChatDoc._id;
          await chatHistoryDoc.save();
        }

        results.chatHistories.fixed++;
      } else {
        // Update chat history reference if needed
        if (
          !chatHistoryDoc.chat ||
          chatHistoryDoc.chat.toString() !== chatDoc._id.toString()
        ) {
          chatHistoryDoc.chat = chatDoc._id;
          await chatHistoryDoc.save();
          results.chatHistories.fixed++;
        }
      }
    }
  } catch (error) {
    console.error("Error in ensureChatDocumentConsistency:", error);
    throw error;
  }
};

/**
 * Get database statistics
 */
export const getDatabaseStats = async () => {
  try {
    const [totalUsers, totalChatHistories, totalChats, usersWithChats] =
      await Promise.all([
        user.countDocuments(),
        chatHistory.countDocuments(),
        chat.countDocuments(),
        user.aggregate([
          {
            $project: {
              chatCount: { $size: "$chatHistory" },
            },
          },
          {
            $group: {
              _id: null,
              avgChats: { $avg: "$chatCount" },
              maxChats: { $max: "$chatCount" },
              minChats: { $min: "$chatCount" },
              usersWithChats: {
                $sum: {
                  $cond: [{ $gt: ["$chatCount", 0] }, 1, 0],
                },
              },
            },
          },
        ]),
      ]);

    // Check for orphaned records
    const [orphanedChatHistories, orphanedChats] = await Promise.all([
      chatHistory.countDocuments({
        $or: [{ user: null }, { user: { $exists: false } }],
      }),
      chat.countDocuments({
        $or: [{ chatHistory: null }, { chatHistory: { $exists: false } }],
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        withChats: usersWithChats[0]?.usersWithChats || 0,
        avgChatsPerUser: usersWithChats[0]?.avgChats || 0,
        maxChatsPerUser: usersWithChats[0]?.maxChats || 0,
      },
      chatHistories: {
        total: totalChatHistories,
        orphaned: orphanedChatHistories,
      },
      chats: {
        total: totalChats,
        orphaned: orphanedChats,
      },
      consistency: {
        isHealthy: orphanedChatHistories === 0 && orphanedChats === 0,
      },
    };
  } catch (error) {
    console.error("Error getting database stats:", error);
    throw error;
  }
};

/**
 * Fix specific user's chat data
 */
export const fixUserChats = async (userId) => {
  try {
    console.log(`🔧 Fixing chats for user: ${userId}`);

    const userData = await user.findById(userId);
    if (!userData) {
      throw new Error(`User ${userId} not found`);
    }

    const originalCount = userData.chatHistory.length;
    const validChatHistoryIds = [];
    let removedCount = 0;
    let addedCount = 0;

    // Check each chat history reference
    for (const chatHistoryId of userData.chatHistory) {
      const chatHistoryDoc = await chatHistory.findOne({
        _id: chatHistoryId,
        user: userId,
      });

      if (chatHistoryDoc) {
        validChatHistoryIds.push(chatHistoryId);
      } else {
        console.log(`🗑️ Removing invalid chat reference: ${chatHistoryId}`);
        removedCount++;
      }
    }

    // Add any orphaned chat histories that belong to this user
    const allUserChats = await chatHistory.find({ user: userId });

    for (const chatHistoryDoc of allUserChats) {
      if (
        !validChatHistoryIds.some(
          (id) => id.toString() === chatHistoryDoc._id.toString()
        )
      ) {
        console.log(`➕ Adding orphaned chat: ${chatHistoryDoc._id}`);
        validChatHistoryIds.push(chatHistoryDoc._id);
        addedCount++;
      }
    }

    // Enforce 15 chat limit
    if (validChatHistoryIds.length > 15) {
      const sortedChats = await chatHistory
        .find({
          _id: { $in: validChatHistoryIds },
          user: userId,
        })
        .sort({ timestamp: -1 });

      const chatsToKeep = sortedChats.slice(0, 15);
      const chatsToRemove = sortedChats.slice(15);

      // Remove old chats
      for (const oldChat of chatsToRemove) {
        await chat.deleteOne({ chatHistory: oldChat._id });
        await chatHistory.deleteOne({ _id: oldChat._id });
      }

      validChatHistoryIds.splice(
        0,
        validChatHistoryIds.length,
        ...chatsToKeep.map((c) => c._id)
      );
    }

    // Update user
    userData.chatHistory = validChatHistoryIds;
    await userData.save();

    console.log(
      `✅ User ${userId} fixed: ${originalCount} -> ${validChatHistoryIds.length} chats`
    );

    return {
      success: true,
      changes: {
        original: originalCount,
        final: validChatHistoryIds.length,
        added: addedCount,
        removed: removedCount,
      },
    };
  } catch (error) {
    console.error(`Error fixing user ${userId}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
};
