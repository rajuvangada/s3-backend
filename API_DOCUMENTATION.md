# API Documentation

Base URL examples:

- Local: `http://localhost:5000`
- Production: `https://your-api-domain`

All protected endpoints require:

```http
Authorization: Bearer <jwt-token>
```

## Health

### `GET /health`

Response:

```json
{
  "status": "UP",
  "message": "Backend Running"
}
```

## Authentication

### `POST /api/auth/register`

Request body:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "secret123"
}
```

### `POST /api/auth/login`

Request body:

```json
{
  "email": "jane@example.com",
  "password": "secret123"
}
```

### `POST /api/auth/logout`

Protected.

### `GET /api/auth/profile`

Protected.

### `PUT /api/auth/profile`

Protected request body:

```json
{
  "name": "Jane Updated",
  "profile_image": "https://example.com/avatar.png"
}
```

### `PUT /api/auth/change-password`

Protected request body:

```json
{
  "oldPassword": "secret123",
  "newPassword": "newsecret123"
}
```

## Folders

### `POST /api/folders`

Protected request body:

```json
{
  "folder_name": "Assignments",
  "parent_folder_id": null
}
```

### `GET /api/folders`

Protected query params:

- `parent_folder_id`: optional, pass `null` or empty for root folders

### `PUT /api/folders/:id`

Protected request body:

```json
{
  "folder_name": "Renamed Folder"
}
```

### `DELETE /api/folders/:id`

Protected. Deletes the folder, subfolders, metadata, and matching S3 objects.

## Files

### `POST /api/files/upload`

Protected multipart form-data:

- `file`: required file
- `folder_id`: optional MongoDB ObjectId or empty for root

Response includes stored metadata and S3 key.

### `GET /api/files`

Protected query params:

- `folder_id`: optional
- `is_favorite`: optional `true` or `false`

### `GET /api/files/:id`

Protected.

### `PUT /api/files/:id`

Protected request body:

```json
{
  "file_name": "resume-final.pdf"
}
```

### `DELETE /api/files/:id`

Protected. Deletes metadata from MongoDB, related share links, and the S3 object.

### `POST /api/files/move`

Protected request body:

```json
{
  "file_id": "6658c6ad8b1d0f4d6a111111",
  "folder_id": "6658c6ad8b1d0f4d6a222222"
}
```

Use `null` or `""` to move a file to the root.

### `POST /api/files/favorite`

Protected request body:

```json
{
  "file_id": "6658c6ad8b1d0f4d6a111111",
  "is_favorite": true
}
```

### `GET /api/files/download/:id`

Protected. Returns a pre-signed S3 download URL.

## Sharing

### `POST /api/share`

Protected request body:

```json
{
  "file_id": "6658c6ad8b1d0f4d6a111111",
  "permission": "read",
  "expiry_hours": 24
}
```

### `GET /api/share/:token`

Public. Returns file metadata and a temporary download URL.

### `DELETE /api/share/:id`

Protected. Revokes the shared link.
