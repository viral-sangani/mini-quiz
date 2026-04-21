export const HOST_ADDRESS = (
  process.env.NEXT_PUBLIC_HOST_ADDRESS ?? ""
).toLowerCase() as `0x${string}` | "";

export function isHostAddress(addr: string | null | undefined): boolean {
  if (!addr || !HOST_ADDRESS) return false;
  return addr.toLowerCase() === HOST_ADDRESS;
}
