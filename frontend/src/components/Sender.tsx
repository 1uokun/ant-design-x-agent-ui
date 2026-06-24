import {
  AppstoreAddOutlined,
  CloudUploadOutlined,
  FileSearchOutlined,
  PaperClipOutlined,
  ProductOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { Attachments, Prompts, Sender as AntSender } from '@ant-design/x';
import { Button, Flex, type GetProp } from 'antd';
import { createStyles } from 'antd-style';
import React, { useEffect, useState } from 'react';
import locale from '../_utils/local';

const useStyle = createStyles(({ token, css }) => ({
  sender: css`
    width: 100%;
    max-width: 840px;
  `,
  senderPrompt: css`
    width: 100%;
    max-width: 840px;
    margin: 0 auto;
    color: ${token.colorText};
  `,
}));

const SENDER_PROMPTS: GetProp<typeof Prompts, 'items'> = [
  {
    key: '1',
    description: locale.upgrades,
    icon: <ScheduleOutlined />,
  },
  {
    key: '2',
    description: locale.components,
    icon: <ProductOutlined />,
  },
  {
    key: '3',
    description: locale.richGuide,
    icon: <FileSearchOutlined />,
  },
  {
    key: '4',
    description: locale.installationIntroduction,
    icon: <AppstoreAddOutlined />,
  },
];

export type ChatSenderProps = {
  activeConversationKey?: string;
  isRequesting: boolean;
  onSubmit: (val: string) => void;
  onCancel: () => void;
};

const ChatSender: React.FC<ChatSenderProps> = ({
  activeConversationKey,
  isRequesting,
  onSubmit,
  onCancel,
}) => {
  const { styles } = useStyle();
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<GetProp<typeof Attachments, 'items'>>([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!activeConversationKey) {
      setInputValue('');
    }
  }, [activeConversationKey]);

  const handleSubmit = (val: string) => {
    onSubmit(val);
    setInputValue('');
  };

  const senderHeader = (
    <AntSender.Header
      title={locale.uploadFile}
      open={attachmentsOpen}
      onOpenChange={setAttachmentsOpen}
      styles={{ content: { padding: 0 } }}
    >
      <Attachments
        beforeUpload={() => false}
        items={attachedFiles}
        onChange={(info) => setAttachedFiles(info.fileList)}
        placeholder={(type) =>
          type === 'drop'
            ? { title: locale.dropFileHere }
            : {
                icon: <CloudUploadOutlined />,
                title: locale.uploadFiles,
                description: locale.clickOrDragFilesToUpload,
              }
        }
      />
    </AntSender.Header>
  );

  return (
    <Flex vertical gap={12} align="center" style={{ margin: 8 }}>
      {!attachmentsOpen && (
        <Prompts
          items={SENDER_PROMPTS}
          onItemClick={(info) => {
            handleSubmit(info.data.description as string);
          }}
          styles={{
            item: { padding: '6px 12px' },
          }}
          className={styles.senderPrompt}
        />
      )}
      <AntSender
        value={inputValue}
        header={senderHeader}
        onSubmit={() => {
          handleSubmit(inputValue);
        }}
        onChange={setInputValue}
        onCancel={onCancel}
        prefix={
          <Button
            type="text"
            icon={<PaperClipOutlined style={{ fontSize: 18 }} />}
            onClick={() => setAttachmentsOpen(!attachmentsOpen)}
          />
        }
        loading={isRequesting}
        className={styles.sender}
        allowSpeech
        placeholder={locale.askOrInputUseSkills}
      />
    </Flex>
  );
};

export default ChatSender;
