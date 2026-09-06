terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ---------- Default VPC (free) ----------

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ---------- Security Groups ----------

resource "aws_security_group" "rds" {
  name        = "auditionease-rds"
  description = "Allow PostgreSQL access from local IP and Lambda"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "PostgreSQL from local IPv4"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.my_ipv4]
  }

  dynamic "ingress" {
    for_each = var.my_ipv6 != "" ? [var.my_ipv6] : []
    content {
      description      = "PostgreSQL from local IPv6"
      from_port        = 5432
      to_port          = 5432
      protocol         = "tcp"
      ipv6_cidr_blocks = [ingress.value]
    }
  }

  ingress {
    description     = "PostgreSQL from Lambda"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "auditionease-rds"
  }
}

resource "aws_security_group" "lambda" {
  name        = "auditionease-lambda"
  description = "Security group for Lambda functions"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "auditionease-lambda"
  }
}

# ---------- RDS PostgreSQL ----------

resource "aws_db_subnet_group" "default" {
  name       = "auditionease"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "auditionease"
  }
}

resource "aws_db_instance" "postgres" {
  identifier     = "auditionease"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.default.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = true

  multi_az            = false
  skip_final_snapshot = true

  backup_retention_period    = 7
  storage_encrypted          = true
  performance_insights_enabled = false

  tags = {
    Name = "auditionease"
  }
}

# ---------- Route 53 ----------

data "aws_route53_zone" "main" {
  name = var.domain_name
}

resource "aws_route53_record" "db" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${var.db_subdomain}.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_db_instance.postgres.address]
}
