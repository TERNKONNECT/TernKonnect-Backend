terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = "ternkonnect" # Matching your frontend profile
}

# Securely generate a random password for the database
resource "random_password" "db_password" {
  length           = 16
  special          = true
  # Exclude characters that often break connection strings
  override_special = "_-!" 
}

# Create a security group to allow Lambda/Local access to the database
resource "aws_security_group" "rds_sg" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow inbound PostgreSQL traffic"

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Publicly accessible (Required since Lambda is not in a VPC)
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

# Provision the RDS PostgreSQL instance
resource "aws_db_instance" "postgres" {
  identifier           = "${var.project_name}-db"
  allocated_storage    = 20
  engine               = "postgres"
  engine_version       = "16" 
  instance_class       = "db.t4g.micro" # Free Tier eligible in most regions
  db_name              = var.db_name
  username             = var.db_username
  password             = random_password.db_password.result
  
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  
  publicly_accessible = true
  skip_final_snapshot = true # Allows you to destroy the DB quickly without waiting for a backup

  tags = {
    Name = "${var.project_name}-postgres"
  }
}

# Create the S3 bucket for media files
resource "aws_s3_bucket" "media" {
  bucket        = var.s3_bucket_name
  force_destroy = true # Allows destroying bucket with objects in it during cleanup

  tags = {
    Name = var.s3_bucket_name
  }
}

# Disable S3 Public Access Blocks to allow public policy attachment
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Attach a bucket policy to allow public read access for all objects
resource "aws_s3_bucket_policy" "media_public_read" {
  bucket     = aws_s3_bucket.media.id
  depends_on = [aws_s3_bucket_public_access_block.media]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.media.arn}/*"
      }
    ]
  })
}

# Configure CORS for client-side uploads or secure rendering
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Create an IAM policy that can be attached to the Lambda's execution role
resource "aws_iam_policy" "s3_access_policy" {
  name        = "${var.project_name}-s3-access-policy"
  description = "Allows the backend Lambda function to manage S3 media files"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.media.arn,
          "${aws_s3_bucket.media.arn}/*"
        ]
      }
    ]
  })
}


