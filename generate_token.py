import argparse

from zoom_common_utils.core.tools.config import ServiceDependencyConfig
from zoom_common_utils.core.tools.csms_manager import CSMSManagerConfig
from zoom_common_utils.core.tools.jwt_manager import JWTManagerConfig
from zoom_common_utils.core.tools.tool_factory import ToolFactory

# do not generate token more than 1 week!!!
ONE_WEEK_IN_SECONDS = 60 * 60 * 24 * 7

parser = argparse.ArgumentParser(
    description="Generate a JWT token using a private key file")
parser.add_argument("-audience", type=str, help="audience")
parser.add_argument("-csms_prefix", type=str, help="csms_prefix")
parser.add_argument(
    "-ttl",
    type=int,
    help="time in seconds for the token to be valid default is 1 week",
    default=ONE_WEEK_IN_SECONDS,
    const=ONE_WEEK_IN_SECONDS,
    nargs="?",
)
args = parser.parse_args()

prefix = "/".join(args.csms_prefix.split("/")[:2])

config = ServiceDependencyConfig(
    csms_config=CSMSManagerConfig(
        csms_prefix=args.csms_prefix, public_key_csms_prefixs=[prefix]),
    jwt_config=JWTManagerConfig(),
)

ToolFactory.build_all_tools(config)

jwt_token = ToolFactory.jwt_manager.generate_jwt_token(
    audience=args.audience, expire_time=args.ttl)
verify_jwt_token = ToolFactory.jwt_manager.verify_jwt_token(
    jwt_token=jwt_token, audience=args.audience)
print(f"JWT TOKEN Expire ttl {args.ttl} Validate {verify_jwt_token}")
print(jwt_token)
