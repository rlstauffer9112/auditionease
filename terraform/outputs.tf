output "db_endpoint" {
  description = "RDS endpoint (host:port)"
  value       = aws_db_instance.postgres.endpoint
}

output "db_host" {
  description = "RDS hostname"
  value       = aws_db_instance.postgres.address
}

output "db_cname" {
  description = "Friendly CNAME for the database"
  value       = "${var.db_subdomain}.${var.domain_name}"
}

output "db_connection_string" {
  description = "PostgreSQL connection string"
  value       = "postgresql://${var.db_username}:PASSWORD@${var.db_subdomain}.${var.domain_name}:5432/${var.db_name}"
  sensitive   = false
}

output "lambda_security_group_id" {
  description = "Attach this security group to your Lambda function"
  value       = aws_security_group.lambda.id
}
