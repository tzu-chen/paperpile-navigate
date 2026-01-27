import { MathJax } from 'better-react-mathjax';

interface Props {
  children: string;
  inline?: boolean;
}

export default function LaTeX({ children, inline = true }: Props) {
  return <MathJax inline={inline}>{children}</MathJax>;
}
