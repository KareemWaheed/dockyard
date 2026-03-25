#!/bin/bash

# Variables
SECURITY_GROUP_STAGE="sg-0EXAMPLE1111111111"   # Replace with your Stage Security Group ID
SECURITY_GROUP_PROD="sg-0EXAMPLE2222222222"    # Replace with your Prod Security Group ID
SECURITY_GROUP_ID=$SECURITY_GROUP_STAGE  # Default to stage security group
PORT_START=0                         # Start of the TCP port range (0)
PORT_END=65535                       # End of the TCP port range (65535)
PROTOCOL="tcp"                       # Protocol, usually tcp or udp
IP=""                                # Default empty, will be set by either parameter or fetched
DESCRIPTION=""                       # Description (name) for identifying the rule
ENVIRONMENT="stage"                  # Default environment is stage

# Usage function
usage() {
  echo "Usage: $0 [-e <prod|stage>] [-i <IP Address>] [-d <Description>] [-h]"
  echo "  -e <prod|stage>  : (Optional) Specify the environment (prod or stage). Default is stage."
  echo "  -i <IP Address>  : (Optional) Specify the IP address to use. If not provided, public IP will be fetched."
  echo "  -d <Description> : Description (name) to identify the security group rule (e.g., Nehal, Kareem)."
  echo "  -h               : Show this help message."
  exit 1
}

# Parse command-line arguments
while getopts ":e:i:d:h" opt; do
  case $opt in
    e) ENVIRONMENT="$OPTARG"
       ;;
    i) IP="$OPTARG"
       ;;
    d) DESCRIPTION="$OPTARG"
       ;;
    h) usage
       ;;
    \?) echo "Invalid option -$OPTARG" >&2
        usage
       ;;
  esac
done

if [[ "$ENVIRONMENT" == "prod" ]]; then
  SECURITY_GROUP_ID=$SECURITY_GROUP_PROD
elif [[ "$ENVIRONMENT" != "stage" ]]; then
  echo "Invalid environment: $ENVIRONMENT. Use 'prod' or 'stage'."
  usage
fi

# Ensure the description is provided
if [[ -z "$DESCRIPTION" ]]; then
  echo "Error: Description is required (-d <Description>)."
  usage
fi

# If no IP was provided, fetch the public IP
if [[ -z "$IP" ]]; then
  echo "No IP address provided. Fetching public IP..."
  IP=$(curl -s http://checkip.amazonaws.com)

  # Check if IP was retrieved
  if [[ -z "$IP" ]]; then
    echo "Could not retrieve public IP. Exiting."
    exit 1
  fi
fi

# Construct the CIDR (IP address with /32 subnet)
CIDR="$IP/32"

# Search for existing rules with the given description (name)
echo "Checking existing security group rules for description: $DESCRIPTION"

# Fetch the security group rules and filter by description (if it exists)
RULE_EXISTS=$(aws ec2 describe-security-groups \
  --group-ids $SECURITY_GROUP_ID \
  --query "SecurityGroups[0].IpPermissions[?contains(IpRanges[*].Description, '$DESCRIPTION')]" \
  --output json)

# Check if rule exists (length of RULE_EXISTS should be greater than 2 if there's a match)
if [[ ${#RULE_EXISTS} -gt 2 ]]; then
  echo "A rule with description '$DESCRIPTION' already exists. Updating it with new IP: $CIDR."

  # Extract the existing CIDR associated with the description
  EXISTING_CIDR=$(echo "$RULE_EXISTS" | jq -r '.[].IpRanges[] | select(.Description == "'"$DESCRIPTION"'") | .CidrIp')

  # Revoke the old rule
  aws ec2 revoke-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions "[{\"IpProtocol\":\"$PROTOCOL\",\"FromPort\":$PORT_START,\"ToPort\":$PORT_END,\"IpRanges\":[{\"CidrIp\":\"$EXISTING_CIDR\",\"Description\":\"$DESCRIPTION\"}]}]"

  # Add the new rule with updated IP
  aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions "[{\"IpProtocol\":\"$PROTOCOL\",\"FromPort\":$PORT_START,\"ToPort\":$PORT_END,\"IpRanges\":[{\"CidrIp\":\"$CIDR\",\"Description\":\"$DESCRIPTION\"}]}]"
else
  echo "No existing rule found with description '$DESCRIPTION'. Adding a new rule."

  # Add the new rule with the specified description
  aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions "[{\"IpProtocol\":\"$PROTOCOL\",\"FromPort\":$PORT_START,\"ToPort\":$PORT_END,\"IpRanges\":[{\"CidrIp\":\"$CIDR\",\"Description\":\"$DESCRIPTION\"}]}]"
fi

# Check if the command succeeded
if [ $? -eq 0 ]; then
  echo "Successfully processed rule with description '$DESCRIPTION' for IP $CIDR allowing all TCP traffic in $ENVIRONMENT."
else
  echo "Failed to process rule."
  exit 1
fi