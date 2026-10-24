
import { Image } from 'antd'
import logo from '../../assets/logo.png'

export default function Logo({ size = 32 }: { size?: number }) {
    return (
        <Image
            width={size}
            alt="basic"
            src={logo}
        />
    );
}