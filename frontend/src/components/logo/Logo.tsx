
// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Image } from 'antd'
import logo from '../../assets/logo.png'

export default function Logo({ size = 32 }: { size?: number }) {
    return (
        <Image
            width={size}
            alt="basic"
            src={logo}
            preview={false}
        />
    );
}