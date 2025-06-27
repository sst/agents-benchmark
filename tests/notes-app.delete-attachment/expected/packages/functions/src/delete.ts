import { Resource } from "sst";
import { Util } from "@notes/core/util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, GetCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const dynamoDb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const main = Util.handler(async (event) => {
  const userId = event.requestContext.authorizer?.iam.cognitoIdentity.identityId;
  const noteId = event?.pathParameters?.id;

  // First, get the note to check if it has an attachment
  const getParams = {
    TableName: Resource.Notes.name,
    Key: {
      userId,
      noteId,
    },
  };

  const result = await dynamoDb.send(new GetCommand(getParams));
  
  if (!result.Item) {
    throw new Error("Item not found.");
  }

  // If the note has an attachment, delete it from S3
  if (result.Item.attachment) {
    const deleteObjectParams = {
      Bucket: Resource.Uploads.name,
      Key: `private/${userId}/${result.Item.attachment}`,
    };

    await s3.send(new DeleteObjectCommand(deleteObjectParams));
  }

  // Delete the note from DynamoDB
  const deleteParams = {
    TableName: Resource.Notes.name,
    Key: {
      userId,
      noteId,
    },
  };

  await dynamoDb.send(new DeleteCommand(deleteParams));

  return JSON.stringify({ status: true });
});
