import type { ReactNode } from 'react';

type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonBackgroundColor = 'white' | 'light-gray' | 'red' | 'orange' | 'yellow' | 'green';

interface CoreButtonProps {
  size?: ButtonSize;
  backgroundColor?: ButtonBackgroundColor;
  onClick?: () => void;
  text?: string | number;
  children?: ReactNode;
  disabled?: boolean;
}

function CoreButton({
  size = 'md',
  backgroundColor = 'white',
  onClick,
  text,
  children,
  disabled = false,
}: CoreButtonProps) {
  const sizeOptions: Record<ButtonSize, string> = {
    sm: 'px-2 py-1 w-[6em]',
    md: 'px-4 py-2 w-[12em]',
    lg: 'px-6 py-3 w-[18em]',
  };

  const backgroundColorOptions: Record<ButtonBackgroundColor, string> = {
    white: 'bg-white',
    'light-gray': 'bg-gray-100',
    red: 'bg-red-200',
    orange: 'bg-orange-200',
    yellow: 'bg-yellow-200',
    green: 'bg-green-200',
  };

  const buttonContent = children || text;
  const bgColor = backgroundColorOptions[backgroundColor];
  const isLargeButton = size === 'lg';
  const isClickable = !disabled && onClick && !isLargeButton;

  const buttonClasses = [
    sizeOptions[size],
    bgColor,
    isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
    'transition-opacity',
  ]
    .filter(Boolean)
    .join(' ');

  // Large buttons are always non-clickable (rendered as div)
  if (isLargeButton) {
    return <div className={buttonClasses}>{buttonContent}</div>;
  }

  return (
    <button onClick={onClick} disabled={disabled} className={buttonClasses}>
      {buttonContent}
    </button>
  );
}

export default CoreButton;
