output "db_host" {
  description = "The database host address"
  value       = aws_db_instance.postgres.address
}

output "db_port" {
  description = "The database port"
  value       = aws_db_instance.postgres.port
}

output "db_username" {
  description = "The database username"
  value       = aws_db_instance.postgres.username
}

output "db_password" {
  description = "The generated database password"
  value       = random_password.db_password.result
  sensitive   = true
}

output "database_url" {
  description = "The full connection string to place in your .env file"
  value       = "postgres://${aws_db_instance.postgres.username}:${random_password.db_password.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"
  sensitive   = true
}

output "s3_bucket_name" {
  description = "The name of the S3 bucket for media files"
  value       = aws_s3_bucket.media.id
}

output "s3_bucket_region" {
  description = "The AWS region of the S3 bucket"
  value       = var.aws_region
}

output "s3_access_policy_arn" {
  description = "The ARN of the IAM policy granting read/write access to the media S3 bucket. Attach this to your Lambda role."
  value       = aws_iam_policy.s3_access_policy.arn
}


