from importlib import resources
from typing import Final

DEFAULT_ENCODING: Final = "utf-8"


def read_text_asset(package: str, name: str, *, encoding: str = DEFAULT_ENCODING) -> str:
    return resources.files(package).joinpath(name).read_text(encoding=encoding)
