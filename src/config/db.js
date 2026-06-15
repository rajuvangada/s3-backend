const mysql = require('mysql2/promise');
const logger = require('./logger');

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'studentvault',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

logger.info(`Initializing database connection pool for host: ${dbConfig.host}:${dbConfig.port}`);

let pool;
try {
  pool = mysql.createPool(dbConfig);
} catch (err) {
  logger.error(`Failed to create MySQL pool structure: ${err.message}`);
}

// In-Memory Database store
const memoryDb = {
  users: [],
  folders: [],
  files: [],
  sharedLinks: [],
  activityLogs: []
};

// SQL Emulator Query Runner
const runMockQuery = async (sql, params) => {
  const cleanSql = sql.trim().replace(/\s+/g, ' ');
  
  try {
    // 1. SELECT id FROM Users WHERE email = ?
    if (cleanSql.startsWith('SELECT id FROM Users WHERE email = ?')) {
      const email = params[0];
      const matches = memoryDb.users.filter(u => u.email === email);
      return [matches.map(u => ({ id: u.id }))];
    }
    
    // 2. INSERT INTO Users
    if (cleanSql.startsWith('INSERT INTO Users (name, email, password_hash)')) {
      const [name, email, passwordHash] = params;
      const newUser = {
        id: memoryDb.users.length + 1,
        name,
        email,
        password_hash: passwordHash,
        profile_image: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.users.push(newUser);
      return [{ insertId: newUser.id }];
    }
    
    // 3. SELECT * FROM Users WHERE email = ?
    if (cleanSql.startsWith('SELECT * FROM Users WHERE email = ?')) {
      const email = params[0];
      const matches = memoryDb.users.filter(u => u.email === email);
      return [matches];
    }
    
    // 4. SELECT id, name, email FROM Users WHERE id = ?
    if (cleanSql.startsWith('SELECT id, name, email FROM Users WHERE id = ?') || 
        cleanSql.startsWith('SELECT id, name, email, profile_image FROM Users WHERE id = ?')) {
      const id = parseInt(params[0], 10);
      const matches = memoryDb.users.filter(u => u.id === id);
      return [matches];
    }

    // 5. UPDATE Users SET password_hash = ? WHERE id = ?
    if (cleanSql.startsWith('UPDATE Users SET password_hash = ? WHERE id = ?')) {
      const [newHash, userId] = params;
      const user = memoryDb.users.find(u => u.id === parseInt(userId, 10));
      if (user) {
        user.password_hash = newHash;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    // 6. UPDATE Users SET ... WHERE id = ? (dynamic profile updates)
    if (cleanSql.startsWith('UPDATE Users SET')) {
      const userId = parseInt(params[params.length - 1], 10);
      const user = memoryDb.users.find(u => u.id === userId);
      if (user) {
        const setPart = cleanSql.split('UPDATE Users SET ')[1].split(' WHERE ')[0];
        const fields = setPart.split(',').map(f => f.trim().split(' ')[0]);
        fields.forEach((field, idx) => {
          user[field] = params[idx];
        });
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    
    // 7. SELECT password_hash FROM Users WHERE id = ?
    if (cleanSql.startsWith('SELECT password_hash FROM Users WHERE id = ?')) {
      const id = parseInt(params[0], 10);
      const matches = memoryDb.users.filter(u => u.id === id);
      return [matches.map(u => ({ password_hash: u.password_hash }))];
    }
    
    // 8. SELECT user_id FROM Folders WHERE id = ?
    if (cleanSql.startsWith('SELECT user_id FROM Folders WHERE id = ?')) {
      const id = parseInt(params[0], 10);
      const matches = memoryDb.folders.filter(f => f.id === id);
      return [matches.map(f => ({ user_id: f.user_id }))];
    }
    
    // 9. SELECT user_id, folder_name FROM Folders WHERE id = ?
    if (cleanSql.startsWith('SELECT user_id, folder_name FROM Folders WHERE id = ?')) {
      const id = parseInt(params[0], 10);
      const matches = memoryDb.folders.filter(f => f.id === id);
      return [matches.map(f => ({ user_id: f.user_id, folder_name: f.folder_name }))];
    }
    
    // 10. INSERT INTO Folders
    if (cleanSql.startsWith('INSERT INTO Folders')) {
      const [userId, folderName, parentFolderId] = params;
      const newFolder = {
        id: memoryDb.folders.length + 1,
        user_id: userId,
        folder_name: folderName,
        parent_folder_id: parentFolderId || null,
        created_at: new Date().toISOString()
      };
      memoryDb.folders.push(newFolder);
      return [{ insertId: newFolder.id }];
    }
    
    // 11. SELECT * FROM Folders WHERE user_id = ?
    if (cleanSql.startsWith('SELECT * FROM Folders WHERE user_id = ?')) {
      const userId = params[0];
      let matches = memoryDb.folders.filter(f => f.user_id === userId);
      if (cleanSql.includes('AND parent_folder_id IS NULL')) {
        matches = matches.filter(f => f.parent_folder_id === null);
      } else if (cleanSql.includes('AND parent_folder_id = ?')) {
        const parentId = parseInt(params[1], 10);
        matches = matches.filter(f => f.parent_folder_id === parentId);
      }
      return [matches];
    }
    
    // 12. UPDATE Folders SET folder_name = ? WHERE id = ?
    if (cleanSql.startsWith('UPDATE Folders SET folder_name = ? WHERE id = ?')) {
      const [folderName, id] = params;
      const folder = memoryDb.folders.find(f => f.id === parseInt(id, 10));
      if (folder) {
        folder.folder_name = folderName;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    
    // 13. DELETE FROM Folders WHERE id = ? (Recursive Cascade)
    if (cleanSql.startsWith('DELETE FROM Folders WHERE id = ?')) {
      const id = parseInt(params[0], 10);
      
      const folderIdsToDelete = [id];
      let added = true;
      while (added) {
        added = false;
        memoryDb.folders.forEach(f => {
          if (f.parent_folder_id && folderIdsToDelete.includes(f.parent_folder_id) && !folderIdsToDelete.includes(f.id)) {
            folderIdsToDelete.push(f.id);
            added = true;
          }
        });
      }
      
      memoryDb.folders = memoryDb.folders.filter(f => !folderIdsToDelete.includes(f.id));
      memoryDb.files = memoryDb.files.filter(f => !folderIdsToDelete.includes(f.folder_id));
      memoryDb.sharedLinks = memoryDb.sharedLinks.filter(s => !memoryDb.files.find(f => f.id === s.file_id));
      
      return [{ affectedRows: folderIdsToDelete.length }];
    }

    // 14. WITH RECURSIVE FolderHierarchy
    if (cleanSql.includes('FolderHierarchy')) {
      const parentId = parseInt(params[0], 10);
      const userId = params[1];
      
      const folderIds = [parentId];
      let added = true;
      while (added) {
        added = false;
        memoryDb.folders.forEach(f => {
          if (f.user_id === userId && f.parent_folder_id && folderIds.includes(f.parent_folder_id) && !folderIds.includes(f.id)) {
            folderIds.push(f.id);
            added = true;
          }
        });
      }
      
      const matchFiles = memoryDb.files.filter(f => f.user_id === userId && folderIds.includes(f.folder_id));
      return [matchFiles.map(f => ({ s3_key: f.s3_key }))];
    }
    
    // 15. INSERT INTO Files
    if (cleanSql.startsWith('INSERT INTO Files')) {
      const [fileId, userId, folderId, fileName, originalName, fileType, fileSize, s3Key] = params;
      const newFile = {
        id: fileId,
        user_id: userId,
        folder_id: folderId || null,
        file_name: fileName,
        original_name: originalName,
        file_type: fileType,
        file_size: fileSize,
        s3_key: s3Key,
        is_favorite: 0,
        is_deleted: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.files.push(newFile);
      return [{ insertId: fileId }];
    }
    
    // 16. SELECT * FROM Files WHERE user_id = ?
    if (cleanSql.startsWith('SELECT * FROM Files WHERE user_id = ?') || 
        cleanSql.startsWith('SELECT user_id, folder_id, file_name FROM Files WHERE user_id = ?')) {
      const userId = params[0];
      let list = memoryDb.files.filter(f => f.user_id === userId && f.is_deleted === 0);
      
      if (cleanSql.includes('AND folder_id IS NULL')) {
        list = list.filter(f => f.folder_id === null);
      } else if (cleanSql.includes('AND folder_id = ?')) {
        const folderId = parseInt(params[1], 10);
        list = list.filter(f => f.folder_id === folderId);
      }
      
      if (cleanSql.includes('AND is_favorite = ?')) {
        const favVal = params[params.length - 1] === 'true' || params[params.length - 1] === 1;
        list = list.filter(f => f.is_favorite === (favVal ? 1 : 0));
      }
      return [list];
    }
    
    // 17. SELECT * FROM Files WHERE id = ?
    if (cleanSql.startsWith('SELECT * FROM Files WHERE id = ? AND is_deleted = 0') ||
        cleanSql.startsWith('SELECT user_id, file_name FROM Files WHERE id = ? AND is_deleted = 0') ||
        cleanSql.startsWith('SELECT user_id, folder_id, file_name FROM Files WHERE id = ? AND is_deleted = 0') ||
        cleanSql.startsWith('SELECT user_id FROM Files WHERE id = ? AND is_deleted = 0')) {
      const id = params[0];
      const matches = memoryDb.files.filter(f => f.id === id && f.is_deleted === 0);
      return [matches];
    }
    
    // 18. UPDATE Files SET file_name = ?
    if (cleanSql.startsWith('UPDATE Files SET file_name = ? WHERE id = ?')) {
      const [fileName, id] = params;
      const file = memoryDb.files.find(f => f.id === id);
      if (file) {
        file.file_name = fileName;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    
    // 19. UPDATE Files SET is_deleted = 1
    if (cleanSql.startsWith('UPDATE Files SET is_deleted = 1 WHERE id = ?')) {
      const id = params[0];
      const file = memoryDb.files.find(f => f.id === id);
      if (file) {
        file.is_deleted = 1;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    
    // 20. UPDATE Files SET folder_id = ?
    if (cleanSql.startsWith('UPDATE Files SET folder_id = ? WHERE id = ?')) {
      const [folderId, id] = params;
      const file = memoryDb.files.find(f => f.id === id);
      if (file) {
        file.folder_id = folderId || null;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    
    // 21. UPDATE Files SET is_favorite = ?
    if (cleanSql.startsWith('UPDATE Files SET is_favorite = ? WHERE id = ?')) {
      const [isFavorite, id] = params;
      const file = memoryDb.files.find(f => f.id === id);
      if (file) {
        file.is_favorite = isFavorite ? 1 : 0;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    
    // 22. INSERT INTO SharedLinks
    if (cleanSql.startsWith('INSERT INTO SharedLinks')) {
      const [shareId, fileId, token, permission, expiryDate] = params;
      const newShare = {
        id: shareId,
        file_id: fileId,
        token,
        permission: permission || 'read',
        expiry_date: expiryDate,
        created_at: new Date().toISOString()
      };
      memoryDb.sharedLinks.push(newShare);
      return [{ insertId: shareId }];
    }
    
    // 23. SharedLinks Inner Join
    if (cleanSql.includes('FROM SharedLinks sl INNER JOIN Files f')) {
      if (cleanSql.includes('sl.token = ?')) {
        const token = params[0];
        const share = memoryDb.sharedLinks.find(s => s.token === token);
        if (!share) return [[]];
        const file = memoryDb.files.find(f => f.id === share.file_id && f.is_deleted === 0);
        if (!file) return [[]];
        return [[{
          share_id: share.id,
          expiry_date: share.expiry_date,
          file_id: file.id,
          file_name: file.file_name,
          original_name: file.original_name,
          file_type: file.file_type,
          file_size: file.file_size,
          s3_key: file.s3_key,
          user_id: file.user_id
        }]];
      }
      if (cleanSql.includes('sl.id = ?')) {
        const id = params[0];
        const share = memoryDb.sharedLinks.find(s => s.id === id);
        if (!share) return [[]];
        const file = memoryDb.files.find(f => f.id === share.file_id);
        if (!file) return [[]];
        return [[{
          id: share.id,
          user_id: file.user_id
        }]];
      }
    }
    
    // 24. DELETE FROM SharedLinks
    if (cleanSql.startsWith('DELETE FROM SharedLinks WHERE id = ?')) {
      const id = params[0];
      const initialLength = memoryDb.sharedLinks.length;
      memoryDb.sharedLinks = memoryDb.sharedLinks.filter(s => s.id !== id);
      return [{ affectedRows: initialLength - memoryDb.sharedLinks.length }];
    }
    
    // 25. INSERT INTO ActivityLogs
    if (cleanSql.startsWith('INSERT INTO ActivityLogs')) {
      const [userId, action, details, ipAddress] = params;
      const newLog = {
        id: memoryDb.activityLogs.length + 1,
        user_id: userId,
        action,
        details,
        ip_address: ipAddress,
        created_at: new Date().toISOString()
      };
      memoryDb.activityLogs.push(newLog);
      return [{ insertId: newLog.id }];
    }
    
    // 26. SELECT 1
    if (cleanSql.startsWith('SELECT 1')) {
      return [[{ '1': 1 }]];
    }

    logger.warn(`[SQL SIMULATOR] Warning: query not simulated: "${cleanSql}"`);
    return [[]];
  } catch (err) {
    logger.error(`[SQL SIMULATOR] Error evaluating query "${cleanSql}": ${err.message}`);
    throw err;
  }
};

const poolWrapper = {
  isDbConnected: false,
  useInMemory: false,
  query: async (sql, params) => {
    if (poolWrapper.useInMemory) {
      return runMockQuery(sql, params);
    }
    try {
      return await pool.query(sql, params);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ER_ACCESS_DENIED_ERROR') {
        logger.warn(`Database connection lost or failed: ${err.message}. Switching to simulated mode.`);
        poolWrapper.useInMemory = true;
        poolWrapper.isDbConnected = false;
        return runMockQuery(sql, params);
      }
      throw err;
    }
  }
};

// Check DB connection on startup
if (pool) {
  pool.query('SELECT 1')
    .then(() => {
      poolWrapper.isDbConnected = true;
      logger.info('Database connection established and verified successfully.');
    })
    .catch((err) => {
      poolWrapper.isDbConnected = false;
      poolWrapper.useInMemory = true;
      logger.warn(`Database connection failed: ${err.message}. Backend switching to IN-MEMORY database simulation.`);
    });
} else {
  poolWrapper.useInMemory = true;
  poolWrapper.isDbConnected = false;
  logger.warn('No database pool available. Backend initialized in IN-MEMORY database simulation.');
}

module.exports = poolWrapper;
