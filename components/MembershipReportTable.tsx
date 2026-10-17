import React from "react";

interface Member {
  sn: number;
  voucherNo: string;
  cardNumber: string;
  name: string;
  remainingDays: number;
}

interface Group {
  articleName: string;
  members: Member[];
}

interface MembershipReportTableProps {
  groupedData: Group[];
}

export const MembershipReportTable = ({ groupedData }: MembershipReportTableProps) => {
  return (
    <div className="overflow-x-auto border border-gray-300 rounded-md">
      <table className="w-full text-left border-collapse">
        <thead className="bg-gray-100 text-gray-700 uppercase text-xs font-semibold">
          <tr>
            <th className="p-3 border-b">SN</th>
            <th className="p-3 border-b">Voucher No</th>
            <th className="p-3 border-b">Card Number</th>
            <th className="p-3 border-b">Name</th>
            <th className="p-3 border-b">Remaining Day</th>
          </tr>
        </thead>
        <tbody>
          {groupedData.map((group, idx) => (
            <React.Fragment key={idx}>
              <tr className="bg-gray-50">
                <td colSpan={5} className="p-2 font-bold text-gray-800 border-b">
                  Article Name: {group.articleName}
                </td>
              </tr>
              {group.members.map((member) => (
                <tr key={member.voucherNo} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3 text-gray-600">{member.sn}</td>
                  <td className="p-3 text-blue-600 font-medium">{member.voucherNo}</td>
                  <td className="p-3 text-gray-600">{member.cardNumber}</td>
                  <td className="p-3 text-blue-800">{member.name}</td>
                  <td className="p-3">
                    <span className="bg-green-700 text-white px-3 py-1 rounded text-xs font-bold">
                      {member.remainingDays}
                    </span>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
