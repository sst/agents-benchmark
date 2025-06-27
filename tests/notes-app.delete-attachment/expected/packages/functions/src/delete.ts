import { Resource } from "sst";
import { Util } from "@notes/core/util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  GetCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const dynamoDb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const main = Util.handler(async (event) => {
  const params = {
    TableName: Resource.Notes.name,
    Key: {
      userId: event.requestContext.authorizer?.iam.cognitoIdentity.identityId,
      noteId: event?.pathParameters?.id, // The id of the note from the path
    },
  };

  // First, get the note to check if it has an attachment
  const result = await dynamoDb.send(new GetCommand(params));

  if (result.Item && result.Item.attachment) {
    // Delete the attachment from S3
    const deleteParams = {
      Bucket: Resource.Uploads.name,
      Key: `private/${event.requestContext.authorizer?.iam.cognitoIdentity.identityId}/${result.Item.attachment}`,
    };

    await s3.send(new DeleteObjectCommand(deleteParams));
  }

  // Delete the note from DynamoDB
  await dynamoDb.send(new DeleteCommand(params));

  return JSON.stringify({ status: true });
});
