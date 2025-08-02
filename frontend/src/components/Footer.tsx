import Image from "next/image";
import Link from "next/link";
import { FaTelegramPlane } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

export default function Footer() {
  return (
    <footer className="flex flex-col items-start gap-6 bg-background px-[120px] py-12">
      <div className="flex items-center justify-between self-stretch">
        <Image
          src="/images/hckm-logo.png"
          alt="Hackers.Market"
          width={227}
          height={48}
        />
        <div className="flex items-center gap-6">
          <FaTelegramPlane className="text-xl" />
          <FaXTwitter className="text-xl" />
        </div>
      </div>
      <div className="flex flex-col items-start gap-8 self-stretch">
        <div className="flex items-center gap-6">
          <Link href="/#">RWAs</Link>
          <Link href="/#">Crypto</Link>
          <Link href="/#">NFTs</Link>
        </div>
        <p className="text-sm text-muted-foreground">© 2025 Hackers.Market</p>
      </div>
    </footer>
  );
}
