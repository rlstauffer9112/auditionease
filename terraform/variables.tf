variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "auditionease"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "auditionease_admin"
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "my_ipv4" {
  description = "Your local IPv4 address (e.g. 203.0.113.50/32)"
  type        = string
}

variable "my_ipv6" {
  description = "Your local IPv6 address (e.g. 2601:681::/128)"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Root domain name (must match Route 53 hosted zone)"
  type        = string
  default     = "auditionease.com"
}

variable "db_subdomain" {
  description = "Subdomain for the database CNAME record"
  type        = string
  default     = "db"
}
